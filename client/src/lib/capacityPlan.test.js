import { describe, expect, it } from 'vitest';
import { ASSUMED, HOSTS, planHosting, ratesFrom } from './capacityPlan.js';

const plan = (over = {}) => planHosting({
  students: 500, peakShare: 0.25, dailyShare: 0.4, hourRate: 10, rates: { ...ASSUMED }, ...over,
});
const host = (result, id) => result.hosts.find((h) => h.id === id);

describe('prices', () => {
  it('keeps the figures it was checked against', () => {
    // A change here should come with a new PRICES_CHECKED date.
    expect(HOSTS.map((h) => [h.id, h.price])).toEqual([
      ['render-starter', 7], ['render-standard', 25], ['render-pro', 85], ['lightsail-2gb', 12], ['lightsail-8gb', 44],
    ]);
  });
});

describe('which rates it uses', () => {
  it('uses assumptions until there is enough real traffic', () => {
    expect(ratesFrom({ measured: false, rpsPerOnline: 9 })).toEqual({ ...ASSUMED, measured: false });
    expect(ratesFrom(null).measured).toBe(false);
  });

  it('uses real rates once there is, and fills only what is missing', () => {
    const rates = ratesFrom({ measured: true, rpsPerOnline: 0.4, cpuMsPerRequest: 3, dbOpsPerRequest: null });
    expect(rates).toMatchObject({ measured: true, rpsPerOnline: 0.4, cpuMsPerRequest: 3, dbOpsPerRequest: ASSUMED.dbOpsPerRequest });
  });

  it('never believes a request is cheaper than the load test found', () => {
    expect(ratesFrom({ measured: true, cpuMsPerRequest: 0.01 }).cpuMsPerRequest).toBe(0.84);
  });
});

describe('the sums', () => {
  it('works out who is online and what they need', () => {
    const p = plan();
    expect(p.online).toBe(125);
    expect(p.coresNeeded).toBeCloseTo(0.0531, 3); // 125 × 0.25/s × 1.7ms
    expect(p.gbPerMonth).toBe(6); // 500 × 40% × 30 days × 1MB
  });

  it('matches the load test: 2000 together on one core drain in about 12 seconds', () => {
    const p = plan({ students: 2000, peakShare: 1, rates: { ...ASSUMED, cpuMsPerRequest: 0.84 } });
    expect(host(p, 'render-standard').rushSeconds).toBeCloseTo(11.8, 1); // measured p95: 11.4s
  });

  it('charges Render bandwidth past 5GB, and not before', () => {
    const p = plan();
    expect(host(p, 'render-starter').bandwidthCost).toBeCloseTo(0.15); // 1GB over, at $0.15
    expect(host(p, 'render-starter').monthly).toBeCloseTo(7.15);
    expect(host(plan({ students: 100 }), 'render-starter').bandwidthCost).toBe(0);
  });

  it('does not charge for bandwidth inside the Lightsail allowance', () => {
    expect(host(plan({ students: 50000 }), 'lightsail-2gb').bandwidthCost).toBe(0);
  });
});

describe('fitting a plan', () => {
  it('picks the cheapest that fits', () => {
    expect(plan({ students: 300 }).best.id).toBe('render-starter');
  });

  it('moves up when a class rush outgrows half a core', () => {
    // 500 online would leave the last student 12 seconds behind on Starter.
    const p = plan({ students: 2000 });
    expect(host(p, 'render-starter').fits).toBe(false);
    expect(host(p, 'render-starter').limitedBy).toBe('a class rush');
    expect(p.best.id).toBe('render-standard');
  });

  it('stops short of paying for CPUs the process cannot use', () => {
    const p = plan({ students: 2000 });
    expect(host(p, 'render-pro').maxStudents).toBe(host(p, 'render-standard').maxStudents);
    expect(host(p, 'render-pro').wastesCores).toBe(true);
    expect(p.best.id).not.toBe('render-pro');
  });

  it('holds Lightsail to what it can sustain, not to its two vCPUs', () => {
    const steady = plan({ students: 3000, rates: { ...ASSUMED, rpsPerOnline: 1.2, sustainedRatio: 1 } });
    expect(host(steady, 'lightsail-2gb').limitedBy).toBe('a long busy stretch');
  });

  it('prefers Lightsail on price alone once your time is free', () => {
    const p = plan({ students: 2000, hourRate: 0 });
    expect(p.best.id).toBe('lightsail-2gb');
    expect(plan({ students: 2000, hourRate: 10 }).best.id).toBe('render-standard');
  });

  it('turns a plan down if the process would not fit in it', () => {
    const p = plan({ memoryMb: 450 });
    expect(host(p, 'render-starter').fits).toBe(false);
    expect(host(p, 'render-starter').limitedBy).toBe('memory');
  });

  it('says when nothing fits, rather than naming the biggest box', () => {
    const p = plan({ students: 20000 });
    expect(p.best).toBeNull();
    expect(p.next).toBeNull();
  });

  it('names the next step on the same provider', () => {
    const p = plan({ students: 300 });
    expect(p.next.id).toBe('render-standard');
    expect(p.best.maxStudents).toBeGreaterThanOrEqual(300);
  });
});

describe('the database', () => {
  it('stays on the free tier while it fits', () => {
    const p = plan({ students: 300, database: { dataMb: 20, indexMb: 5, studentsNow: 100 } });
    expect(p.database.tier.id).toBe('m0');
    expect(p.database.storageMb).toBe(75); // grows with students
  });

  it('moves up for operations a second', () => {
    expect(plan({ students: 2000, peakShare: 0.5 }).database.tier.id).toBe('flex');
  });

  it('moves up for storage', () => {
    const p = plan({ students: 1000, database: { dataMb: 450, indexMb: 50, studentsNow: 100 } });
    expect(p.database.tier.id).toBe('m10');
  });

  it('copes with not knowing the current size', () => {
    expect(plan({ database: null }).database.storageMb).toBe(0);
  });
});

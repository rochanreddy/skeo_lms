import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearApiCache } from '../../api.js';
import { fakeServer, json, signIn } from '../../test/server.js';
import AdminUsage from './Usage.jsx';

const evidence = (over = {}) => ({
  peakOnline: 0, studentsNow: 400, daysMeasured: 0, measured: false,
  needs: { peakOnline: 20, requests: 5000, days: 3 },
  rpsPerOnline: null, cpuMsPerRequest: null, dbOpsPerRequest: null, mbPerStudentDay: null,
  peakShare: null, dailyShare: null, sustainedRatio: null,
  ...over,
});

const usage = (over = {}) => ({
  days: 30,
  live: {
    online: 12, inflight: 0, cores: 0.02, busy: 0.05, loopMs: 1, rssMb: 180, heapMb: 90, dbInUse: 0,
    limits: { cpuLimit: 0.5, memoryLimitMb: 512, heapLimitMb: 258, cpusVisible: 8 },
  },
  totals: {
    requests: 90000, serverErrors: 3, limited: 1, bytesOut: 2e9, bytesIn: 1e8, dbOps: 70000, videoPlays: 640,
    restarts: 2, activeDays: 20, avgDailyStudents: 150,
  },
  peaks: { online: 80, rps: 9, inflight: 14, cores: 0.21, busy: 0.4, loopMs: 18, rssMb: 240, heapMb: 120, dbConns: 6, p50Ms: 50, p95Ms: 250 },
  daily: [
    { day: '2026-11-04', students: 140, restarts: 0, requests: 40000, bytesOut: 1e9, videoPlays: 300, peakOnline: 60, serverErrors: 1 },
    { day: '2026-11-05', students: 160, restarts: 1, requests: 50000, bytesOut: 1e9, videoPlays: 340, peakOnline: 80, serverErrors: 2 },
  ],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, online: hour === 20 ? 80 : 5, requests: 100 })),
  routes: [{ area: 'programs', requests: 40000, ms: 900000 }, { area: 'other', requests: 500, ms: 1000 }],
  database: { dataMb: 40, indexMb: 10, storageMb: 30 },
  evidence: evidence(),
  ...over,
});

const measured = evidence({
  measured: true, daysMeasured: 20, peakOnline: 80, rpsPerOnline: 0.2, cpuMsPerRequest: 2,
  dbOpsPerRequest: 0.8, mbPerStudentDay: 3, peakShare: 0.2, dailyShare: 0.375, sustainedRatio: 0.5,
});

const open = async (body = usage()) => {
  const server = fakeServer({ '/usage?days=30': body, '/usage?days=7': usage({ days: 7 }) });
  render(<AdminUsage />);
  await screen.findByRole('heading', { level: 2 });
  return server;
};

beforeEach(() => {
  signIn({ id: 'a1', role: 'admin', fullName: 'Admin' });
  clearApiCache();
});

describe('the answer', () => {
  it('leads with the plan for the students enrolled today', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Render Starter covers 400 students.');
  });

  it('says plainly when it is not working from real use yet', async () => {
    await open();
    expect(screen.getByText(/load test and assumptions, not real students yet/)).toBeTruthy();
    expect(screen.getAllByText('Assumed').length).toBeGreaterThan(1);
  });

  it('says what it measured once it has enough', async () => {
    await open(usage({ evidence: measured }));
    expect(screen.getByText(/Going by real use: 20 days, with up to 80 students online together/)).toBeTruthy();
    expect(screen.getByLabelText(/Online at the busiest moment/).value).toBe('20');
  });

  it('follows the headcount being planned for', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/Students enrolled/), { target: { value: '2000' } });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Render Standard covers 2,000 students.');
  });

  it('says so when no single server fits, and why', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/Students enrolled/), { target: { value: '20000' } });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('One server does not cover');
    expect(screen.getByText(/needs Redis and a second process/)).toBeTruthy();
  });

  it('survives a field being cleared on the way to a new number', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/Students enrolled/), { target: { value: '' } });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('covers 400 students.');
  });

  it('weighs AWS in cash and in time, and can drop the time', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/Students enrolled/), { target: { value: '2000' } });
    expect(screen.getByText(/AWS Lightsail 2GB would save/).textContent).toContain('cost about 3 hours a month');
    fireEvent.change(screen.getByLabelText(/An hour of your time/), { target: { value: '0' } });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('AWS Lightsail 2GB covers');
  });

  it('flags plans that pay for cores the API cannot use', async () => {
    await open();
    expect(screen.getByText('No gain. The API runs on one core.')).toBeTruthy();
  });
});

describe('the evidence', () => {
  it('shows what happened', async () => {
    await open();
    expect(screen.getByText('Online now').nextSibling.textContent).toContain('12');
    expect(screen.getAllByText('Video starts')[0].nextSibling.textContent).toContain('640');
    expect(screen.getByText('240MB of 512MB')).toBeTruthy();
    expect(screen.getByText('Half under 50ms, 95% under 250ms')).toBeTruthy();
  });

  it('reports what the server was actually given', async () => {
    await open();
    expect(screen.getByText(/This server can see: 0.5 CPU, 512MB of memory, a 258MB heap/)).toBeTruthy();
  });

  it('warns in words as well as colour', async () => {
    const hot = usage();
    hot.peaks.rssMb = 480;
    await open(hot);
    expect(screen.getByText('At its limit')).toBeTruthy();
  });

  it('treats bandwidth over the allowance as a cost, not a limit', async () => {
    const heavy = usage();
    heavy.totals.bytesOut = 26e9; // 1.3GB on each of 20 days is 39GB a month
    await open(heavy);
    expect(screen.getByText('Over the Render allowance: about $5.10 a month extra')).toBeTruthy();
    expect(screen.queryByText('At its limit')).toBeNull();
  });

  it('counts its CPUs properly when there is no limit to read', async () => {
    const local = usage();
    local.live.limits = { cpuLimit: null, memoryLimitMb: null, heapLimitMb: 256, cpusVisible: 1 };
    await open(local);
    expect(screen.getByText(/This server can see: 1 CPU, no limit set/)).toBeTruthy();
  });

  it('does not show charts of nothing before any data exists', async () => {
    await open(usage({ totals: { ...usage().totals, requests: 0 }, daily: [], routes: [] }));
    expect(screen.getByText(/Nothing recorded in this period yet/)).toBeTruthy();
    expect(screen.queryByText('Day by day')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy(); // the calculator still works
  });

  it('asks again for another period', async () => {
    const server = await open();
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(server.paths()).toContain('/usage?days=7'));
    expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says what went wrong rather than sitting on a skeleton', async () => {
    fakeServer({ '/usage?days=30': json({ error: 'Admins only.' }, 403) });
    render(<AdminUsage />);
    expect(await screen.findByText('Admins only.')).toBeTruthy();
  });
});

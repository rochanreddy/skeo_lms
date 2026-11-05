// The meter's arithmetic, with no server and no database. What a real server
// writes was checked by running one against a throwaway database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  buildUpdates, bucketStart, heapLimitMb, istDay, latencyKey, onlineNow, parseCpuMax, routeArea, usageMeter,
} from '../utils/usageMeter.js';

const hit = (req, statusCode = 200) => {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  let nexted = false;
  usageMeter({ path: '/api/skeo/programs', baseUrl: '/api/skeo/programs', ...req }, res, () => { nexted = true; });
  return { res, nexted };
};

test('a latency lands in the first band that holds it', () => {
  assert.equal(latencyKey(4), 'l10');
  assert.equal(latencyKey(10), 'l10');
  assert.equal(latencyKey(10.5), 'l25');
  assert.equal(latencyKey(60_000), 'lInfinity');
});

test('requests are grouped by router, and anything else is other', () => {
  assert.equal(routeArea('/api/skeo/programs'), 'programs');
  assert.equal(routeArea('/api/skeo'), 'other'); // rate limited before a router
  assert.equal(routeArea(''), 'other'); // a preflight
  assert.equal(routeArea('/wp-admin'), 'other'); // a scanner cannot add rows
  assert.equal(routeArea(undefined), 'other');
});

test('five minute buckets start on the five minutes', () => {
  assert.equal(bucketStart(Date.UTC(2026, 10, 5, 10, 7, 42)).toISOString(), '2026-11-05T10:05:00.000Z');
});

test('a day turns over at midnight in India, not in UTC', () => {
  assert.equal(istDay(Date.UTC(2026, 10, 5, 18, 29)), '2026-11-05');
  assert.equal(istDay(Date.UTC(2026, 10, 5, 18, 31)), '2026-11-06');
});

test('reads a cgroup CPU limit, and an unlimited one as none', () => {
  assert.equal(parseCpuMax('50000 100000'), 0.5);
  assert.equal(parseCpuMax('100000 100000\n'), 1);
  assert.equal(parseCpuMax('max 100000'), null);
  assert.equal(parseCpuMax(null), null);
});

test('reports the heap that was asked for, not V8\'s larger total', () => {
  assert.equal(heapLimitMb('--max-old-space-size=256', 470e6), 256);
  assert.equal(heapLimitMb('--trace-gc --max-old-space-size=512', 470e6), 512);
  assert.equal(heapLimitMb(undefined, 470e6), 470); // nothing set: V8's own is all there is
});

test('the platform health check is not usage', () => {
  const { res, nexted } = hit({ path: '/health' });
  assert.equal(nexted, true);
  assert.equal(res.listenerCount('close'), 0);
});

test('a student counts as online, an admin does not', () => {
  const before = onlineNow();
  hit({ user: { role: 'admin', _id: '64b000000000000000000001' } }).res.emit('close');
  assert.equal(onlineNow(), before);
  const student = { role: 'student', _id: '64b000000000000000000002' };
  hit({ user: student }).res.emit('close');
  hit({ user: student }).res.emit('close');
  assert.equal(onlineNow(), before + 1, 'twice is still one student');
});

test('nobody stays online once five minutes have passed', () => {
  hit({ user: { role: 'student', _id: '64b000000000000000000003' } }).res.emit('close');
  assert.equal(onlineNow(Date.now() + 5 * 60_000 + 1000), 0);
});

test('one minute of counters becomes increments and peaks', () => {
  const window = {
    requests: 10, serverErrors: 1, limited: 2, bytesOut: 5000, bytesIn: 900, cpuMs: 123.4, dbOps: 7, videoPlays: 3,
    lat: { l10: 8, l100: 2 },
    routes: { programs: { n: 6, ms: 40.6 }, other: { n: 4, ms: 1 } },
    peakInflight: 3, peakRps: 1.26, peakCores: 0.1234, peakBusy: 0.5, peakLoopMs: 2.04, peakRssMb: 120.4, peakHeapMb: 50.6, peakDbConns: 2,
  };
  const { bucket, day } = buildUpdates(window, { online: 4, newStudents: ['64b000000000000000000002'], boot: true, limits: { cpuLimit: 0.5 } });

  assert.equal(bucket.$inc.requests, 10);
  assert.equal(bucket.$inc.cpuMs, 123);
  assert.equal(bucket.$inc['lat.l10'], 8);
  assert.equal(bucket.$max.online, 4);
  assert.equal(bucket.$max.peakCores, 0.123);
  assert.equal(day.$inc['routes.programs.n'], 6);
  assert.equal(day.$inc['routes.programs.ms'], 41);
  assert.equal(day.$inc.boots, 1);
  assert.equal(day.$addToSet.students.$each.length, 1);
  assert.deepEqual(day.$set, { limits: { cpuLimit: 0.5 } });
});

test('a quiet minute writes nothing a database would refuse', () => {
  const quiet = { lat: {}, routes: {}, cpuMs: 0, peakCores: 0, peakBusy: 0, peakLoopMs: 0, peakRssMb: 0, peakHeapMb: 0, peakRps: 0 };
  const { day } = buildUpdates(quiet, { online: 0 });
  assert.deepEqual(day, {}); // an empty $inc or $addToSet is an error in MongoDB
});

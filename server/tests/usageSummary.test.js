// The sums the hosting calculator stands on. Wrong here means a wrong plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence, percentile } from '../utils/usageSummary.js';

const bucket = (over = {}) => ({ requests: 3000, online: 100, cpuMs: 9000, dbOps: 2400, ...over });
const day = (over = {}) => ({ students: 200, requests: 20000, bytesOut: 400e6, peakOnline: 100, ...over });
const base = (over = {}) => ({
  busiest: [bucket(), bucket()],
  quietest: [{ cpuMs: 300 }, { cpuMs: 300 }],
  days: [day(), day(), day()],
  busiestHourRequests: 18000,
  students: 500,
  ...over,
});

test('rates are per student online and per request', () => {
  const e = buildEvidence(base());
  assert.equal(e.rpsPerOnline, 0.1); // 3000 requests, 100 online, 300 seconds
  assert.equal(e.dbOpsPerRequest, 0.8);
  assert.equal(e.mbPerStudentDay, 2);
});

test('what the process costs idle does not count against requests', () => {
  // 18000ms of CPU over two buckets, less 600ms of doing nothing, over 6000 requests.
  assert.equal(buildEvidence(base()).cpuMsPerRequest, 2.9);
});

test('a quiet range does not produce a negative cost', () => {
  const e = buildEvidence(base({ busiest: [bucket({ requests: 1, cpuMs: 100 })], quietest: [{ cpuMs: 300 }] }));
  assert.equal(e.cpuMsPerRequest, 0);
});

test('shares are of everyone enrolled', () => {
  const e = buildEvidence(base());
  assert.equal(e.peakShare, 0.2);
  assert.equal(e.dailyShare, 0.4);
});

test('days nobody used the app do not dilute the daily share', () => {
  const e = buildEvidence(base({ days: [day(), day(), day(), day({ students: 0, requests: 3 })] }));
  assert.equal(e.dailyShare, 0.4);
  assert.equal(e.daysMeasured, 3);
});

test('a flat afternoon scores near one, a spike well below it', () => {
  assert.equal(buildEvidence(base({ busiestHourRequests: 36000 })).sustainedRatio, 1);
  assert.equal(buildEvidence(base()).sustainedRatio, 0.5);
});

test('it says so when there is not enough to go on', () => {
  assert.equal(buildEvidence(base()).measured, true);
  assert.equal(buildEvidence(base({ days: [day({ peakOnline: 5 })], busiest: [bucket({ online: 5 })] })).measured, false);
  assert.equal(buildEvidence(base({ days: [day(), day()] })).measured, false, 'two days is not a pattern');
  assert.equal(buildEvidence(base({ days: [day({ requests: 100 }), day({ requests: 100 }), day({ requests: 100 })] })).measured, false);
});

test('an empty collection answers with nothing, not with NaN', () => {
  const e = buildEvidence({ busiest: [], quietest: [], days: [], busiestHourRequests: 0, students: 0 });
  assert.equal(e.measured, false);
  assert.equal(e.peakOnline, 0);
  for (const key of ['rpsPerOnline', 'cpuMsPerRequest', 'dbOpsPerRequest', 'mbPerStudentDay', 'peakShare', 'dailyShare', 'sustainedRatio']) {
    assert.equal(e[key], null, key);
  }
});

test('a percentile is the top of the band it falls in', () => {
  const bands = [10, 100, 1000];
  assert.equal(percentile({ l10: 90, l100: 9, l1000: 1 }, bands, 0.5), 10);
  assert.equal(percentile({ l10: 90, l100: 9, l1000: 1 }, bands, 0.95), 100);
  assert.equal(percentile({}, bands, 0.5), null);
});

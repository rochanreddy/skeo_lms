// The curated head of the job board (lib/jobTopPicks.js): good AND new.
// No database; every rule is a pure function of the rows it is given.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTop, daysOld, TOP_DAYS, TOP_MIN_RANK, RECENCY_BOOST } from '../lib/jobTopPicks.js';

// 7 Nov 2026, 10:00 in India.
const NOW = new Date('2026-11-07T04:30:00Z').getTime();
const daysAgo = (d) => new Date(NOW - d * 86400000);

let n = 0;
const job = (over = {}) => ({
  _id: `id${n++}`,
  title: `AI Engineer ${n}`,
  company: `Co ${n}`,
  domain: 'ai-ml',
  rankScore: 70,
  postedAt: daysAgo(1),
  ...over,
});

test('days are calendar days in India time', () => {
  assert.equal(daysOld(job({ postedAt: new Date('2026-11-07T00:30:00Z') }), NOW), 0);
  assert.equal(daysOld(job({ postedAt: new Date('2026-11-06T00:00:00Z') }), NOW), 1);
  // 23:00 on the 5th in India is still the 5th: two days back, not one.
  assert.equal(daysOld(job({ postedAt: new Date('2026-11-05T17:30:00Z') }), NOW), 2);
});

test('a date in the future or no date at all is never picked', () => {
  assert.equal(daysOld(job({ postedAt: new Date('2027-03-01') }), NOW), null);
  assert.equal(daysOld(job({ postedAt: null, fetchedAt: null }), NOW), null);
  const top = pickTop([job({ postedAt: new Date('2027-03-01') }), job({ postedAt: null, fetchedAt: null })], { now: NOW });
  assert.equal(top.length, 0);
});

test(`only the last ${TOP_DAYS} days, and only above the quality floor`, () => {
  const top = pickTop(
    [
      job({ title: 'Old', postedAt: daysAgo(TOP_DAYS + 1), rankScore: 95 }),
      job({ title: 'Weak', rankScore: TOP_MIN_RANK - 1 }),
      job({ title: 'Good', rankScore: TOP_MIN_RANK }),
    ],
    { now: NOW },
  );
  assert.deepEqual(top.map((j) => j.title), ['Good']);
});

test('newest day first, however much better an older job ranks', () => {
  const top = pickTop(
    [
      job({ title: 'Three days, great', rankScore: 95, postedAt: daysAgo(3) }),
      job({ title: 'Yesterday, fine', rankScore: 50, postedAt: daysAgo(1) }),
      job({ title: 'Today, fine', rankScore: 50, postedAt: daysAgo(0) }),
    ],
    { now: NOW },
  );
  assert.deepEqual(top.map((j) => j.title), ['Today, fine', 'Yesterday, fine', 'Three days, great']);
  assert.deepEqual(top.map((j) => j.day), [0, 1, 3]);
});

test('when the head is full, the better and newer job takes the place', () => {
  // Same rank: the boost decides, so today's job is kept over a 5-day-old one.
  const top = pickTop(
    [job({ title: 'Five days', postedAt: daysAgo(5) }), job({ title: 'Today', postedAt: daysAgo(0) })],
    { now: NOW, size: 1 },
  );
  assert.deepEqual(top.map((j) => j.title), ['Today']);
  assert.ok(RECENCY_BOOST[0] > RECENCY_BOOST[TOP_DAYS]);
});

test('the same opening from two sources is kept once, the better copy', () => {
  const top = pickTop(
    [
      job({ title: 'AI Intern', company: 'Acme Ltd.', rankScore: 60, source: 'linkedin' }),
      job({ title: 'ai  intern', company: 'ACME LTD', rankScore: 80, source: 'indeed' }),
    ],
    { now: NOW },
  );
  assert.equal(top.length, 1);
  assert.equal(top[0].rankScore, 80);
});

test('one employer at most five times; unnamed employers share one cap', () => {
  const big = Array.from({ length: 12 }, (_, i) => job({ title: `Role ${i}`, company: 'BigCo' }));
  const anon = Array.from({ length: 12 }, (_, i) => job({ title: `Gig ${i}`, company: null }));
  const top = pickTop([...big, ...anon], { now: NOW });
  assert.equal(top.filter((j) => j.company === 'BigCo').length, 5);
  assert.equal(top.filter((j) => j.company === null).length, 5);
});

test('within a day the domains are interleaved, not one block after another', () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => job({ domain: 'ai-ml', rankScore: 90 - i })),
    ...Array.from({ length: 10 }, (_, i) => job({ domain: 'sales', rankScore: 60 - i })),
  ];
  const top = pickTop(rows, { now: NOW });
  const firstFour = top.slice(0, 4).map((j) => j.domain);
  assert.ok(firstFour.includes('ai-ml') && firstFour.includes('sales'), firstFour.join());
  // ...and inside a domain the order is still best first.
  const ai = top.filter((j) => j.domain === 'ai-ml').map((j) => j.rankScore);
  assert.deepEqual(ai, [...ai].sort((a, b) => b - a));
});

test('the head never holds more than its size', () => {
  const rows = Array.from({ length: 1500 }, () => job());
  assert.equal(pickTop(rows, { now: NOW }).length, 1000);
});

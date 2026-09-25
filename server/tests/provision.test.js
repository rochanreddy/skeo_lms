// Which batches a website order unlocks, and the temporary password it mints.
// Pure — no database, no server:
//
//   node --test tests/provision.test.js
//
// The database side (one account and one mail per order however many times it
// is delivered, existing passwords left alone) was proved against a real
// server on a throwaway database; see routes/provision.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { batchesFor, tempPassword } from '../utils/provision.js';

const B = ['Claude', 'ChatGPT', 'Gemini', 'AI Coding'].map((name, i) => ({ _id: `b${i}`, name }));

test('Everything AI unlocks every batch, as a standing entitlement', () => {
  const r = batchesFor(['member'], B);
  assert.deepEqual(r.batchIds, ['b0', 'b1', 'b2', 'b3']);
  assert.equal(r.allAccess, true);
  assert.deepEqual(r.warnings, []);
});

test('Everything AI wins even when bought with other items', () => {
  assert.equal(batchesFor(['claude', 'member'], B).batchIds.length, 4);
});

test('the Claude Course unlocks the batch named Claude, matched case-insensitively', () => {
  const r = batchesFor(['claude'], [{ _id: 'x', name: '  claude ' }, ...B.slice(1)]);
  assert.deepEqual(r.batchIds, ['x']);
  assert.equal(r.allAccess, false);
});

test('a Claude Course with no Claude batch still succeeds, and says why nothing unlocked', () => {
  const r = batchesFor(['claude'], B.slice(1));
  assert.deepEqual(r.batchIds, []);
  assert.equal(r.warnings.length, 1);
});

test('playbooks and library unlock no batch', () => {
  assert.deepEqual(batchesFor(['playbooks', 'library'], B).batchIds, []);
});

test('temporary passwords are 10 unambiguous characters and do not repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const p = tempPassword();
    assert.match(p, /^[a-km-np-zA-HJ-NP-Z2-9]{10}$/);
    seen.add(p);
  }
  assert.equal(seen.size, 500);
});

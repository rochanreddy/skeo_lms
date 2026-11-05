// The cache key behind GET /programs.
//
// /programs shares its finished body because it is the largest and
// most-requested response in the app. The body is not the same for
// everybody, though: a student with blocked curriculum modules gets a trimmed
// copy. So the key has to be a faithful answer to "would withoutBlockedModules
// build these two users the same thing?" -- if it is ever looser than that, one
// student's trimmed curriculum is served to another, which is the only way
// this cache could do real harm rather than merely go stale.
//
// Hence a test per rule rather than one broad one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { listCacheKey } from '../routes/programs.js';

const student = (moduleIds) => ({ role: 'student', blocked: { moduleIds } });

test('two students with no blocks share one entry', () => {
  assert.equal(listCacheKey(student([])), '');
  assert.equal(listCacheKey(student([])), listCacheKey(student([])));
  // Which is also the common case: nobody normally has a module blocked.
  assert.equal(listCacheKey({ role: 'student', blocked: {} }), '');
  assert.equal(listCacheKey({ role: 'student' }), '');
});

test('a student with blocks does NOT share the unblocked entry', () => {
  assert.notEqual(listCacheKey(student(['6500000000000000000000a1'])), listCacheKey(student([])));
});

test('different block sets never collide', () => {
  const a = listCacheKey(student(['6500000000000000000000a1']));
  const b = listCacheKey(student(['6500000000000000000000b2']));
  const both = listCacheKey(student(['6500000000000000000000a1', '6500000000000000000000b2']));
  assert.notEqual(a, b);
  assert.notEqual(a, both);
  assert.notEqual(b, both);
});

test('the same block set in a different order is the same entry', () => {
  // Order is incidental -- the admin UI sends whatever order the toggles were
  // clicked in -- and two students blocked from the same modules see the same
  // curriculum, so they should share the work.
  assert.equal(
    listCacheKey(student(['6500000000000000000000a1', '6500000000000000000000b2'])),
    listCacheKey(student(['6500000000000000000000b2', '6500000000000000000000a1'])),
  );
});

test('ObjectId and string spellings of the same block are one entry', () => {
  // blocked.moduleIds comes off a Mongoose document as ObjectIds and out of
  // the auth cache as whatever was stored; both must key the same.
  const asObject = { toString: () => '6500000000000000000000a1' };
  assert.equal(listCacheKey(student([asObject])), listCacheKey(student(['6500000000000000000000a1'])));
});

test('a repeated block id does not change the entry', () => {
  assert.equal(
    listCacheKey(student(['6500000000000000000000a1', '6500000000000000000000a1'])),
    listCacheKey(student(['6500000000000000000000a1'])),
  );
});

test('an admin is pinned to the unblocked entry, whatever their blocked list says', () => {
  // withoutBlockedModules() hands an admin the whole programme regardless, so
  // keying them by their own blocked list would mean a second identical copy
  // of the largest response in the app -- and, worse, an admin's key could
  // then match a student's and serve that student the untrimmed curriculum.
  assert.equal(listCacheKey({ role: 'admin', blocked: { moduleIds: ['6500000000000000000000a1'] } }), '');
  assert.equal(
    listCacheKey({ role: 'admin', blocked: { moduleIds: ['6500000000000000000000a1'] } }),
    listCacheKey(student([])),
  );
});

test('a missing or malformed user does not throw, and gets the shared entry', () => {
  // Never reached in practice -- requireAuth runs first -- but a key function
  // that throws would turn the busiest route in the app into a 500.
  assert.equal(listCacheKey(undefined), '');
  assert.equal(listCacheKey(null), '');
  assert.equal(listCacheKey({}), '');
});

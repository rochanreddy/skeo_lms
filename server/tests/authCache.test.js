// requireAuth's handling of concurrent lookups.
//
// A home screen fires seven requests at once, and on a cold cache each of them
// used to fetch the same user. They now share one lookup. The danger in sharing
// is a block: forget() has to win against a lookup already under way, or a
// student blocked at that instant carries on as if nothing happened.
//
// No database: User.findById is replaced, so the timing can be controlled.

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { User } from '../models/User.js';
import { forget, requireAuth } from '../middleware/auth.js';
import { signAccessToken } from '../utils/token.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

function fakeUser(extra = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    email: 'a@example.test',
    fullName: 'A',
    role: 'student',
    lastActiveAt: new Date(),
    ...extra,
  };
}

const request = (user) => ({
  headers: { authorization: `Bearer ${signAccessToken(user)}` },
});

function call(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    requireAuth(req, res, () => resolve({ status: 200, user: req.user }));
  });
}

function stubLookups(t, answers) {
  const seen = { lookups: 0 };
  t.mock.method(User, 'findById', () => {
    const answer = answers[seen.lookups];
    seen.lookups += 1;
    return { lean: () => answer };
  });
  return seen;
}

test('seven concurrent requests look the user up once', async (t) => {
  const user = fakeUser();
  const row = deferred();
  const seen = stubLookups(t, [row.promise]);
  const all = Promise.all(Array.from({ length: 7 }, () => call(request(user))));
  row.resolve(user);
  const answers = await all;
  assert.equal(seen.lookups, 1);
  assert.ok(answers.every((a) => a.status === 200));
  forget(user._id);
});

test('each request still gets its own copy of the user', async (t) => {
  const user = fakeUser();
  const row = deferred();
  stubLookups(t, [row.promise]);
  const all = Promise.all([call(request(user)), call(request(user))]);
  row.resolve(user);
  const [a, b] = await all;
  assert.notEqual(a.user, b.user);
  a.user.fullName = 'Changed by one route';
  assert.equal(b.user.fullName, 'A');
  forget(user._id);
});

test('a request after forget() does not join the lookup already under way', async (t) => {
  const user = fakeUser();
  const stale = deferred();
  const seen = stubLookups(t, [stale.promise, Promise.resolve({ ...user, blocked: { lms: true } })]);

  const before = call(request(user));
  forget(user._id); // the admin's block lands here
  const after = await call(request(user));
  assert.equal(after.status, 403, 'the blocked student was let through on a stale lookup');
  assert.equal(seen.lookups, 2);

  stale.resolve(user);
  await before;
  forget(user._id);
});

test('a lookup that began before forget() is not stored', async (t) => {
  const user = fakeUser();
  const stale = deferred();
  const seen = stubLookups(t, [stale.promise, Promise.resolve({ ...user, blocked: { lms: true } })]);

  const before = call(request(user));
  forget(user._id);
  stale.resolve(user); // the row as it was before the block
  await before;

  const after = await call(request(user));
  assert.equal(after.status, 403, 'the pre-block row went into the cache');
  assert.equal(seen.lookups, 2);
  forget(user._id);
});

test('a user who no longer exists is a 401, and is not remembered', async (t) => {
  const user = fakeUser();
  const seen = stubLookups(t, [Promise.resolve(null), Promise.resolve(user)]);
  assert.equal((await call(request(user))).status, 401);
  assert.equal((await call(request(user))).status, 200);
  assert.equal(seen.lookups, 2);
  forget(user._id);
});

test('a failed lookup is not shared with whoever comes next', async (t) => {
  const user = fakeUser();
  const seen = stubLookups(t, [Promise.reject(new Error('db down')), Promise.resolve(user)]);
  await assert.rejects(requireAuth(request(user), {}, () => {}), /db down/);
  assert.equal((await call(request(user))).status, 200);
  assert.equal(seen.lookups, 2);
  forget(user._id);
});

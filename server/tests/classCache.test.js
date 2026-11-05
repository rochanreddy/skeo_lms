// The cache behind class-wide reads (utils/classCache.js).
//
// A bug here does not fail loudly. It shows a whole class something out of date,
// so the two promises it makes are each tested directly: that a write clears
// it, by every route a write can take, and that a read which began before a
// write can never put the old answer back.
//
// The hook tests need a real database. They run when TEST_MONGODB_URI points at
// a local one (see loadtest/README.md) and skip otherwise.

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { classCache, keepsClassCacheFresh, shortCache } from '../utils/classCache.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('a second caller within the TTL is served without loading', async () => {
  const cache = shortCache({ ttlMs: 1000 });
  let loads = 0;
  const load = async () => { loads += 1; return 'answer'; };
  assert.equal(await cache.get('k', load), 'answer');
  assert.equal(await cache.get('k', load), 'answer');
  assert.equal(loads, 1);
});

test('an expired entry is loaded again', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const cache = shortCache({ ttlMs: 1000 });
  let loads = 0;
  const load = async () => { loads += 1; return loads; };
  await cache.get('k', load);
  t.mock.timers.tick(1001);
  assert.equal(await cache.get('k', load), 2);
});

test('concurrent callers share one read', async () => {
  const cache = shortCache({ ttlMs: 1000 });
  let loads = 0;
  const gate = deferred();
  const load = async () => { loads += 1; return gate.promise; };
  const all = Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);
  gate.resolve('shared');
  assert.deepEqual(await all, ['shared', 'shared', 'shared']);
  assert.equal(loads, 1);
});

test('different keys do not share', async () => {
  const cache = shortCache({ ttlMs: 1000 });
  assert.equal(await cache.get('a', async () => 1), 1);
  assert.equal(await cache.get('b', async () => 2), 2);
});

test('a failure reaches its callers and is not remembered', async () => {
  const cache = shortCache({ ttlMs: 1000 });
  await assert.rejects(cache.get('k', async () => { throw new Error('db down'); }), /db down/);
  assert.equal(await cache.get('k', async () => 'recovered'), 'recovered');
});

test('a loader that throws synchronously is still a rejection', async () => {
  const cache = shortCache({ ttlMs: 1000 });
  await assert.rejects(cache.get('k', () => { throw new Error('bad'); }), /bad/);
});

test('clear() drops what is stored', async () => {
  const cache = shortCache({ ttlMs: 1000 });
  await cache.get('k', async () => 'old');
  cache.clear();
  assert.equal(await cache.get('k', async () => 'new'), 'new');
});

test('a read that began before a write cannot put the old answer back', async () => {
  const cache = shortCache({ ttlMs: 60_000 });
  const slow = deferred();
  const stale = cache.get('k', () => slow.promise); // reads the row...
  cache.clear();                                    // ...the row changes...
  slow.resolve('old');                              // ...then the old read lands
  assert.equal(await stale, 'old');
  assert.equal(await cache.get('k', async () => 'new'), 'new');
});

test('after a write, new callers do not join the read already under way', async () => {
  const cache = shortCache({ ttlMs: 60_000 });
  const slow = deferred();
  const stale = cache.get('k', () => slow.promise);
  cache.clear();
  assert.equal(await cache.get('k', async () => 'new'), 'new');
  slow.resolve('old');
  await stale;
  assert.equal(await cache.get('k', async () => 'unused'), 'new');
});

test('it cannot grow without bound', async () => {
  const cache = shortCache({ ttlMs: 60_000, maxEntries: 3 });
  for (const k of ['a', 'b', 'c', 'd']) await cache.get(k, async () => k);
  let loads = 0;
  await cache.get('a', async () => { loads += 1; return 'a'; });
  assert.equal(loads, 1, 'going past the bound should have dropped the older entries');
});

// ── Every way of writing has to clear it ───────────────────────────────────

const uri = process.env.TEST_MONGODB_URI;
const hooks = { skip: uri ? false : 'set TEST_MONGODB_URI to a local database to run these' };

test('every kind of write clears the cache', hooks, async (t) => {
  const conn = await mongoose.createConnection(uri, { dbName: 'skeo_load_hooks' }).asPromise();
  t.after(async () => { await conn.dropDatabase(); await conn.close(); });

  const schema = new mongoose.Schema({ name: String, n: { type: Number, default: 0 } });
  keepsClassCacheFresh(schema);
  const Thing = conn.model('Thing', schema);
  const { _id: id } = await Thing.create({ name: 'row' });
  const doc = () => Thing.findById(id);

  const writes = {
    'Model.create': () => Thing.create({ name: 'b' }),
    'doc.save (new)': () => new Thing({ name: 'c' }).save(),
    'doc.save (existing)': async () => { const d = await doc(); d.n += 1; await d.save(); },
    'Model.insertMany': () => Thing.insertMany([{ name: 'd' }]),
    'Model.updateOne': () => Thing.updateOne({ _id: id }, { n: 1 }),
    'Model.updateMany': () => Thing.updateMany({}, { $inc: { n: 1 } }),
    'Model.replaceOne': () => Thing.replaceOne({ _id: id }, { name: 'row' }),
    'Model.findOneAndUpdate': () => Thing.findOneAndUpdate({ _id: id }, { n: 2 }),
    'Model.findByIdAndUpdate': () => Thing.findByIdAndUpdate(id, { n: 3 }),
    'Model.findOneAndReplace': () => Thing.findOneAndReplace({ _id: id }, { name: 'row' }),
    'doc.updateOne': async () => { await (await doc()).updateOne({ n: 4 }); },
    'Model.bulkWrite': () => Thing.bulkWrite([{ updateOne: { filter: { _id: id }, update: { n: 5 } } }]),
    'Model.deleteOne': async () => { const d = await Thing.create({ name: 'x' }); await Thing.deleteOne({ _id: d._id }); },
    'doc.deleteOne': async () => { const d = await Thing.create({ name: 'x' }); await d.deleteOne(); },
    'Model.findOneAndDelete': async () => { const d = await Thing.create({ name: 'x' }); await Thing.findOneAndDelete({ _id: d._id }); },
    'Model.findByIdAndDelete': async () => { const d = await Thing.create({ name: 'x' }); await Thing.findByIdAndDelete(d._id); },
    'Model.deleteMany': () => Thing.deleteMany({ name: 'nothing matches' }),
  };

  for (const [name, write] of Object.entries(writes)) {
    await write();
    await classCache.get('probe', async () => 'cached');
    // The write under test is the last thing that touched the collection, so
    // run it again now that there is something to clear.
    const before = classCache.generation;
    await write();
    assert.ok(classCache.generation > before, `${name} did not clear the cache`);
  }
});

test('a plain read does not clear it', hooks, async (t) => {
  const conn = await mongoose.createConnection(uri, { dbName: 'skeo_load_hooks' }).asPromise();
  t.after(() => conn.close());

  const schema = new mongoose.Schema({ name: String });
  keepsClassCacheFresh(schema);
  const Thing = conn.model('ReadOnly', schema);
  const before = classCache.generation;
  await Thing.find().lean();
  await Thing.findOne();
  await Thing.countDocuments();
  await Thing.exists({ name: 'x' });
  assert.equal(classCache.generation, before);
});

test('the five collections behind the cache all carry the hook', async () => {
  const models = await Promise.all(['Assignment', 'Announcement', 'Batch', 'Program', 'Quiz']
    .map((name) => import(`../models/${name}.js`).then((m) => m[name])));
  const hooked = (schema) => schema.s.hooks._posts.has('findOneAndUpdate') && schema.s.hooks._posts.has('bulkWrite');
  for (const model of models) assert.ok(hooked(model.schema), `${model.modelName} is not clearing the cache`);
});

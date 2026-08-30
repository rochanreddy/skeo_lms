// Does a block still take effect at once, now that requireAuth caches?
//
// This lives here rather than in tests/ because it writes: it blocks and
// unblocks a real account, and tests/api.test.js is deliberately read-only.
// Run it against the same throwaway database as the load test.
//
//   LOAD_PORT=4300 node loadtest/blocking.mjs
//
// The cache holds a user record for a few seconds, which is what removed three
// quarters of our database load. The price is that a block could be served from
// a stale entry, so every route that changes access calls forget(). This proves
// that it does.
const API = `http://127.0.0.1:${process.env.LOAD_PORT || 4300}/api/skeo`;
const post = (p, body, token) => fetch(API + p, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const patch = (p, body, token) => fetch(API + p, {
  method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const get = (p, token) => fetch(API + p, { headers: { authorization: `Bearer ${token}` } });

const admin = await (await post('/auth/login', { email: 'admin@skeo.in', password: 'ChangeMe123!' })).json();
const stud  = await (await post('/auth/login', { email: 'load7@skeo.test', password: 'LoadTest123!' })).json();
if (!admin.accessToken || !stud.accessToken) {
  console.error('Could not sign in. This needs the same seeded database as the load test:');
  console.error('  node scripts/seed.js  &&  node loadtest/seed.mjs');
  process.exit(1);
}
const aT = admin.accessToken, sT = stud.accessToken, sId = stud.user.id || stud.user._id;

// Warm the cache hard, so a stale entry would definitely exist.
for (let i = 0; i < 20; i++) await get('/me', sT);
console.log('before block, student /me →', (await get('/me', sT)).status);

const t0 = Date.now();
const r = await patch(`/users/${sId}/blocks`, { lms: true, reason: 'load test' }, aT);
console.log('admin block call →', r.status);

// The very next request, with no delay at all.
const after = await get('/me', sT);
console.log(`IMMEDIATELY after (+${Date.now() - t0}ms), student /me →`, after.status,
            after.status === 403 ? '✅ blocked at once' : '❌ STALE — cache served a blocked user');
if (after.status === 403) console.log('   message:', (await after.json()).error);

// Unblock and confirm access comes back just as fast.
await patch(`/users/${sId}/blocks`, { lms: false, reason: '' }, aT);
const back = await get('/me', sT);
console.log('immediately after unblock →', back.status, back.status === 200 ? '✅ restored at once' : '❌ still blocked');

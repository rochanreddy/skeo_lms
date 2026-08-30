// End-to-end API tests against a live server.
//
// These run over HTTP against a real instance rather than mounting the app in
// process, because what they are protecting is the whole chain -- the auth
// middleware, the role guard, the error handler and the routes together. A test
// that stubbed the middleware out would still pass on the day someone forgets
// to put requireRole on a new admin route, which is exactly the regression
// worth catching.
//
//   npm test            (expects a server on $TEST_API_URL, default :4200)
//
// It only reads. Nothing here creates, edits or deletes a document.

import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.TEST_API_URL || 'http://localhost:4200').replace(/\/+$/, '');
const API = `${BASE}/api/skeo`;

const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'admin@skeo.in',
  password: process.env.TEST_ADMIN_PASSWORD || 'ChangeMe123!',
};
const STUDENT = {
  email: process.env.TEST_STUDENT_EMAIL || 'aarav@demo.skeo.in',
  password: process.env.TEST_STUDENT_PASSWORD || 'student123',
};

async function login(creds) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  assert.equal(r.status, 200, `login failed for ${creds.email} -- is the database seeded?`);
  const { accessToken } = await r.json();
  assert.ok(accessToken, 'login returned no accessToken');
  return accessToken;
}

const get = (path, token) =>
  fetch(`${API}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

// Logging in once and sharing the tokens keeps the suite from rate-limiting
// itself: /login allows 10 attempts a minute per IP.
let adminToken;
let studentToken;

test('the server is up and reachable', async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('both seeded roles can sign in', async () => {
  adminToken = await login(ADMIN);
  studentToken = await login(STUDENT);
});

test('a wrong password is rejected, without saying which half was wrong', async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN.email, password: 'not-the-password' }),
  });
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /invalid email or password/i);
});

test('login cannot be bypassed with a Mongo operator in place of a string', async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } }),
  });
  assert.equal(r.status, 401);
});

test('a forged or malformed token is not accepted', async () => {
  for (const token of ['abc.def.ghi', 'null', 'x'.repeat(200)]) {
    const r = await get('/me', token);
    assert.equal(r.status, 401, `token "${token.slice(0, 12)}" was not rejected`);
  }
});

// The endpoints every signed-in user reaches, and the ones only an admin may.
const SHARED = [
  '/me',
  '/programs',
  '/batches',
  '/assignments',
  '/quizzes',
  '/library',
  '/jobs',
  '/notifications',
  '/announcements',
  '/search?q=a',
];
const ADMIN_ONLY = [
  '/users',
  '/submissions',
  '/stats/overview',
  '/stats/admin-dashboard',
  '/stats/at-risk',
  '/reports/platform',
];

test('every endpoint refuses an anonymous caller', async () => {
  for (const path of [...SHARED, ...ADMIN_ONLY]) {
    const r = await get(path);
    assert.equal(r.status, 401, `${path} answered ${r.status} without a token`);
  }
});

test('shared endpoints serve both roles', async () => {
  for (const path of SHARED) {
    assert.equal((await get(path, adminToken)).status, 200, `admin could not read ${path}`);
    assert.equal((await get(path, studentToken)).status, 200, `student could not read ${path}`);
  }
});

test('admin endpoints are closed to students', async () => {
  for (const path of ADMIN_ONLY) {
    assert.equal((await get(path, adminToken)).status, 200, `admin could not read ${path}`);
    assert.equal((await get(path, studentToken)).status, 403, `student was not forbidden from ${path}`);
  }
});

test('a student reaches their own scoped resources', async () => {
  for (const path of ['/grades/me', '/progress/me']) {
    assert.equal((await get(path, studentToken)).status, 200, `student could not read ${path}`);
  }
});

// The regression this suite exists for: a malformed :id used to reach Mongoose,
// throw a CastError, and come back as a 500 carrying a stack trace.
test('a malformed id is a 404, not a 500, and leaks nothing', async () => {
  const paths = [
    '/batches/notanid',
    '/assignments/notanid',
    '/submissions/notanid',
    '/quizzes/notanid',
    '/programs/notanid',
  ];
  for (const path of paths) {
    const r = await get(path, adminToken);
    assert.equal(r.status, 404, `${path} answered ${r.status}`);
    assert.match(r.headers.get('content-type') || '', /application\/json/, `${path} did not answer JSON`);

    const text = await r.text();
    assert.doesNotMatch(
      text,
      /CastError|ObjectId|node_modules|at .+:\d+:\d+/,
      `${path} leaked internals: ${text.slice(0, 120)}`,
    );
  }
});

test('an unknown path is a JSON 404, not an HTML error page', async () => {
  const r = await get('/no/such/route', adminToken);
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type') || '', /application\/json/);
});

test('a malformed JSON body is a 400', async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{oops',
  });
  assert.equal(r.status, 400);
  assert.match(r.headers.get('content-type') || '', /application\/json/);
});

test('security headers are present', async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(r.headers.get('x-frame-options'), 'no framing protection');
});

test('the API does not advertise the framework it runs on', async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('CORS admits the configured frontend and no one else', async () => {
  const allowed = await fetch(`${API}/`, { headers: { Origin: 'http://localhost:5175' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5175');

  const evil = await fetch(`${API}/`, { headers: { Origin: 'http://evil.example.com' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null, 'an unknown origin was allowed');
});

test('the service no longer identifies as the old menler-lms fork', async () => {
  const body = await (await get('/')).json();
  assert.notEqual(body.service, 'menler-lms');
});

// ── VdoCipher ──
// The account secret is the whole security story here: it never leaves the
// server, and a student can only ever obtain an OTP for a video attached to a
// lesson they are allowed to see. These check the gates, not the upstream —
// they pass whether or not VDOCIPHER_API_SECRET is set.

test('the video library and uploads are admin-only, and closed to anonymous callers', async () => {
  for (const path of ['/videos', '/videos/aaaaaaaaaaaaaaaa']) {
    assert.equal((await get(path)).status, 401, `${path} answered without a token`);
    assert.equal((await get(path, studentToken)).status, 403, `a student was not forbidden from ${path}`);
  }

  const anon = await fetch(`${API}/videos/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  });
  assert.equal(anon.status, 401);
});

test('a student cannot mint a playback OTP for a video no lesson of theirs carries', async () => {
  const r = await fetch(`${API}/videos/deadbeefdeadbeef/otp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  // 404 (not entitled — deliberately indistinguishable from "no such video")
  // or 503 when this instance has no VdoCipher secret. Never 200.
  assert.ok([404, 503].includes(r.status), `unentitled OTP request answered ${r.status}`);

  const anon = await fetch(`${API}/videos/deadbeefdeadbeef/otp`, { method: 'POST' });
  assert.equal(anon.status, 401);
});

test('the OTP route refuses a malformed video id without reaching the upstream', async () => {
  const r = await fetch(`${API}/videos/not%20an%20id/otp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.ok([404, 503].includes(r.status));
});

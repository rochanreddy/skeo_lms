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
import http from 'node:http';
import { gunzipSync } from 'node:zlib';

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

/* A GET with exactly the headers given, and nothing added.
 *
 * fetch() is the right tool almost everywhere here, but it is not a neutral
 * client: it follows the Fetch spec, which adds and rewrites headers on your
 * behalf. For anything testing cache behaviour that matters, see the
 * /programs revalidation test: this sends the bytes asked for and no others. */
function rawGet(path, headers = {}) {
  const { request } = http;
  return new Promise((resolve, reject) => {
    const url = new URL(`${API}${path}`);
    const r = request(
      { host: url.hostname, port: url.port || 80, path: url.pathname + url.search, method: 'GET', headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => { chunks.push(c); });
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, raw, body: raw.toString() });
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
}

// Logging in once and sharing the tokens keeps the suite from rate-limiting
// itself: /login now counts failed attempts per account (8 a minute), and the
// suite deliberately makes a couple of those.
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
  '/support',
  '/webinars',
  '/search?q=a',
];
const ADMIN_ONLY = [
  '/users',
  '/submissions',
  '/stats/admin-dashboard',
  '/stats/at-risk',
  '/reports/platform',
  '/usage',
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

test('the usage report names nobody', async () => {
  const r = await get('/usage?days=7', adminToken);
  assert.equal(r.status, 200);
  const body = await r.text();
  const { evidence, live, hours } = JSON.parse(body);
  assert.equal(hours.length, 24);
  assert.equal(typeof evidence.measured, 'boolean');
  assert.equal(typeof live.limits.heapLimitMb, 'number');
  assert.doesNotMatch(body, /[0-9a-f]{24}/, 'an account id reached the report');
  assert.doesNotMatch(body, /@/, 'an email reached the report');
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
// lesson they are allowed to see. These check the gates, not the upstream,
// they pass whether or not VDOCIPHER_API_SECRET is set.

test('the video library is admin-only, and closed to anonymous callers', async () => {
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
  // 404 (not entitled: deliberately indistinguishable from "no such video")
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

// Push notifications. Nothing here subscribes anything: each request is turned
// away before it could write.
test('the push key is public and says whether push is on', async () => {
  const r = await get('/push/key');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(typeof body.enabled, 'boolean');
  if (body.enabled) assert.match(body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
});

test('subscribing to push needs an account', async () => {
  const r = await fetch(`${API}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'a', auth: 'b' } } }),
  });
  assert.equal(r.status, 401);
});

test('a push endpoint that is not a real push service is refused', async () => {
  const { enabled } = await (await get('/push/key')).json();
  const r = await fetch(`${API}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ subscription: { endpoint: 'https://169.254.169.254/latest/meta-data', keys: { p256dh: 'abc', auth: 'def' } } }),
  });
  // 503 when this server has no push keys, 400 when it does -- never stored.
  assert.equal(r.status, enabled ? 400 : 503);
});

/* ── What the performance pass changed ──────────────────────────────────────
 *
 * These cover behaviour introduced when /programs, /quizzes and /progress/me
 * were made cheaper. Two of them are really correctness tests wearing a
 * performance hat: the quiz projection is now the thing that keeps answers
 * away from students, so if it is ever loosened, a test should fail rather
 * than a student seeing the answer key. Read-only, like the rest of the file.
 */

test('a student never receives quiz answers, in the list or the detail', async () => {
  const { quizzes } = await (await get('/quizzes?scope=mine', studentToken)).json();
  assert.ok(Array.isArray(quizzes), 'no quizzes array came back');
  assert.ok(quizzes.length > 0, 'the demo seed should give the student at least one quiz');

  const leaks = (q) => (q.questions || []).some(
    (qq) => 'correctIndex' in qq || 'explanation' in qq,
  );

  for (const q of quizzes) {
    assert.ok(!leaks(q), `the list leaked answers for quiz ${q._id}`);
    // Each question still has to carry what a student needs to sit it.
    for (const qq of q.questions || []) {
      assert.ok(qq._id, 'a question lost its id');
      assert.equal(typeof qq.text, 'string', 'a question lost its text');
      assert.ok(Array.isArray(qq.options), 'a question lost its options');
    }
  }

  const { quiz } = await (await get(`/quizzes/${quizzes[0]._id}`, studentToken)).json();
  assert.ok(!leaks(quiz), 'the detail route leaked answers');
  assert.ok((quiz.questions || []).length > 0, 'the detail route returned no questions');
});

test('an admin still receives quiz answers, the projection did not break grading', async () => {
  const { quizzes } = await (await get('/quizzes', adminToken)).json();
  assert.ok(quizzes.length > 0, 'the admin should see the seeded quizzes');
  const withQuestions = quizzes.find((q) => (q.questions || []).length);
  assert.ok(withQuestions, 'no admin-visible quiz had questions');
  assert.ok(
    withQuestions.questions.every((qq) => typeof qq.correctIndex === 'number'),
    'the admin view lost correctIndex, so nothing can be marked',
  );
});

test('progress/me with no programId answers for the student\'s own programme', async () => {
  const bare = await (await get('/progress/me', studentToken)).json();
  assert.ok(bare.programId, 'no programId came back, so the client cannot check the answer');
  assert.equal(typeof bare.total, 'number');
  assert.ok(bare.total > 0, 'the seeded curriculum should have lessons to count');

  // Asking explicitly for the same programme must give the same answer: the
  // student home relies on these two agreeing to avoid a second round trip.
  const explicit = await (await get(`/progress/me?programId=${bare.programId}`, studentToken)).json();
  assert.deepEqual(explicit, bare, 'the no-argument and explicit forms disagreed');
});

test('a malformed programId is a 404, not a 500 or an empty report', async () => {
  for (const path of ['/progress/me?programId=notanid', '/progress/certificate?programId=notanid']) {
    const r = await get(path, studentToken);
    assert.equal(r.status, 404, `${path} answered ${r.status}`);
    const text = await r.text();
    assert.doesNotMatch(text, /CastError|ObjectId|node_modules/, `${path} leaked internals`);
  }
});

test('the preflight is cacheable, so every request does not pay for one', async () => {
  // Without this header the browser re-asks every few seconds, which doubled
  // the round trips for every call the app makes.
  const r = await fetch(`${API}/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5175',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.ok(r.status === 204 || r.status === 200, `preflight answered ${r.status}`);
  const maxAge = Number(r.headers.get('access-control-max-age'));
  assert.ok(maxAge >= 600, `Access-Control-Max-Age was ${r.headers.get('access-control-max-age')}`);
});

test('/programs is byte-identical on a repeat read, and revalidatable', async () => {
  // The route keeps its finished JSON briefly. Two reads by the same caller
  // must agree exactly, and must carry an ETag so a browser that already has
  // the curriculum can be answered 304 instead of re-sent all of it.
  const first = await get('/programs', studentToken);
  const firstBody = await first.text();
  const etag = first.headers.get('etag');
  assert.ok(etag, 'no ETag, so a repeat visit re-downloads the whole curriculum');
  assert.match(first.headers.get('cache-control') || '', /private/, 'the curriculum must not be shared-cacheable');

  const second = await get('/programs', studentToken);
  assert.equal(await second.text(), firstBody, 'two reads of /programs disagreed');

  /* The conditional request goes out over node:http rather than fetch(), and
   * that is not fussiness. Per the Fetch spec, setting If-None-Match by hand
   * flips the request's cache mode to "no-store", which makes fetch() add
   * `Cache-Control: no-cache`, and a request that says no-cache is asking to
   * be given the body, so Express rightly answers 200. The revalidation this
   * is checking is the one a BROWSER performs on its own from its HTTP cache,
   * where no such header is added, and only a raw client can imitate that. */
  const conditional = await rawGet('/programs', {
    authorization: `Bearer ${studentToken}`,
    'if-none-match': etag,
  });
  assert.equal(conditional.status, 304, 'a matching ETag was not answered 304');
  assert.equal(conditional.body, '', 'a 304 still sent a body');
});

test('a student and an admin are served the same curriculum, not each other\'s cache', async () => {
  // The cached body is keyed on which modules the caller cannot see. Nobody in
  // the seed has a module blocked, so both roles belong in the same entry and
  // must get the same programmes back -- the unit tests in
  // programsCacheKey.test.js cover the keying rules themselves.
  const asStudent = await (await get('/programs', studentToken)).json();
  const asAdmin = await (await get('/programs', adminToken)).json();
  assert.deepEqual(
    asStudent.programs.map((p) => p._id),
    asAdmin.programs.map((p) => p._id),
  );
});

/* ── Shared responses ─────────────────────────────────────────────────────
 *
 * Whole-class responses are serialised and gzipped once and sent to everyone,
 * and the class's answers are held for a few seconds. The writes that have to
 * clear all that are exercised by loadtest/freshness.mjs, because this file
 * only reads. These cover what a read can get wrong.
 */

const sharedRoutes = ['/programs', '/announcements', '/batches'];

test('a shared response is the same content whether or not it is gzipped', async () => {
  for (const path of sharedRoutes) {
    const auth = { authorization: `Bearer ${studentToken}` };
    const plain = await rawGet(path, auth);
    const packed = await rawGet(path, { ...auth, 'accept-encoding': 'gzip' });
    assert.equal(plain.status, 200, path);
    assert.equal(plain.headers['content-encoding'], undefined, `${path} sent gzip to a client that never asked`);
    assert.match(plain.headers['content-type'], /application\/json/, path);
    assert.match(plain.headers.vary || '', /Accept-Encoding/i, `${path} would poison a cache in between`);
    JSON.parse(plain.body);
    const unpacked = packed.headers['content-encoding'] === 'gzip' ? gunzipSync(packed.raw).toString() : packed.body;
    assert.equal(unpacked, plain.body, `${path} differs once decompressed`);
  }
});

test('a client that refuses gzip is not sent it', async () => {
  const r = await rawGet('/programs', {
    authorization: `Bearer ${studentToken}`,
    'accept-encoding': 'gzip;q=0, identity',
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], undefined);
  JSON.parse(r.body);
});

test('a shared response has one ETag, and it revalidates across encodings', async () => {
  for (const path of sharedRoutes) {
    const auth = { authorization: `Bearer ${studentToken}` };
    const plain = await rawGet(path, auth);
    const packed = await rawGet(path, { ...auth, 'accept-encoding': 'gzip' });
    assert.ok(plain.headers.etag, `${path} carries no ETag`);
    assert.equal(packed.headers.etag, plain.headers.etag, `${path} has a different ETag per encoding`);
    const revisit = await rawGet(path, { ...auth, 'accept-encoding': 'gzip', 'if-none-match': plain.headers.etag });
    assert.equal(revisit.status, 304, `${path} re-sent content the client already had`);
  }
});

test('a student and an admin do not share a quiz list, in either order', async () => {
  const { programs } = await (await get('/programs', studentToken)).json();
  const path = `/quizzes?programId=${programs[0]._id}`;
  const answers = (list) => list.some((q) => (q.questions || []).some((x) => 'correctIndex' in x));
  // The answers are the only thing separating the two shapes, and this is the
  // sharpest case: the same URL, moments apart, with the admin's copy cached.
  for (const token of [adminToken, studentToken, adminToken, studentToken]) {
    const { quizzes } = await (await get(path, token)).json();
    if (token === studentToken) assert.ok(!answers(quizzes), 'a student was served the cached answer key');
  }
});

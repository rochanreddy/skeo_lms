// Concurrency load test for the Skeo API.
//
// Raw node:http with a big-socket agent, so the client is never the bottleneck.
// Each virtual user sends its own X-Forwarded-For, because the API rate-limits
// per IP (trust proxy = 1) and 100 users from one machine would otherwise all
// land in the same bucket and get 429s that say nothing about capacity.
import http from 'node:http';

const HOST = process.env.LOAD_HOST || '127.0.0.1';
const PORT = Number(process.env.LOAD_PORT || 4300);
const USERS = Number(process.env.LOAD_USERS || 100);
const PASSWORD = process.env.LOAD_PASSWORD || 'LoadTest123!';

const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });

function req(method, path, { body, token, ip } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const started = process.hrtime.bigint();
  return new Promise((resolve) => {
    const r = http.request(
      { host: HOST, port: PORT, path, method, agent,
        headers: {
          'x-forwarded-for': ip || '10.0.0.1',
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - started) / 1e6, body: data }));
      },
    );
    r.on('error', (e) => resolve({ status: 0, ms: Number(process.hrtime.bigint() - started) / 1e6, body: e.message }));
    if (payload) r.write(payload);
    r.end();
  });
}

const pct = (arr, p) => arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

function report(name, results, wallMs) {
  const ms = results.map((r) => r.ms);
  const codes = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
  console.log(`\n── ${name} ─────────────────────────────`);
  console.log(`  requests   ${results.length}   ok ${ok}   codes ${JSON.stringify(codes)}`);
  console.log(`  wall       ${wallMs.toFixed(0)}ms   throughput ${(results.length / (wallMs / 1000)).toFixed(1)} req/s`);
  console.log(`  latency    min ${Math.min(...ms).toFixed(0)}  p50 ${pct(ms, 0.5).toFixed(0)}  p95 ${pct(ms, 0.95).toFixed(0)}  max ${Math.max(...ms).toFixed(0)} ms`);
  return { name, count: results.length, ok, codes, wallMs, p50: pct(ms, 0.5), p95: pct(ms, 0.95), max: Math.max(...ms) };
}

// Fire `n` requests all at once and wait for the last one — the honest way to
// ask "what happens when 100 people click at the same second?".
async function burst(name, n, fn) {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
  return report(name, results, Date.now() - t0);
}

const ipFor = (i) => `10.${Math.floor(i / 65025) % 256}.${Math.floor(i / 255) % 256}.${(i % 254) + 1}`;
const summary = [];

// 1. Baseline: no auth, no DB. This is the Express/Node ceiling on this box.
summary.push(await burst(`baseline  GET /health × ${USERS}`, USERS, (i) => req('GET', '/health', { ip: ipFor(i) })));

// 2. The login stampede — every virtual user signs in at once. This is the
//    bcrypt path, and on menler it was where things fell over.
const t0 = Date.now();
const logins = await Promise.all(
  Array.from({ length: USERS }, (_, i) =>
    req('POST', '/api/skeo/auth/login', { ip: ipFor(i), body: { email: `load${i}@skeo.test`, password: PASSWORD } })),
);
summary.push(report(`login     POST /auth/login × ${USERS} (password hashing)`, logins, Date.now() - t0));

const tokens = logins.map((r) => { try { return JSON.parse(r.body).accessToken; } catch { return null; } }).filter(Boolean);
console.log(`\n  → ${tokens.length}/${USERS} usable tokens`);
if (!tokens.length) { console.log('no tokens — cannot run the authenticated scenarios'); process.exit(1); }

// 3. Authenticated read — requireAuth does a User.findById on every request,
//    so this measures the steady-state "logged-in user browsing" cost.
summary.push(await burst(`authed    GET /me × ${USERS}`, USERS,
  (i) => req('GET', '/api/skeo/me', { token: tokens[i % tokens.length], ip: ipFor(i) })));

// 4. Curriculum list — a real read of the heaviest student-facing document.
summary.push(await burst(`content   GET /programs × ${USERS}`, USERS,
  (i) => req('GET', '/api/skeo/programs', { token: tokens[i % tokens.length], ip: ipFor(i) })));

// 5. Sustained browsing: every user does 5 requests, ~1s apart, like a class
//    working through a lesson. Closer to real traffic than a single burst.
const t5 = Date.now();
const sustained = (await Promise.all(
  Array.from({ length: USERS }, async (_, i) => {
    const out = [];
    for (let k = 0; k < 5; k++) {
      out.push(await req('GET', k % 2 ? '/api/skeo/programs' : '/api/skeo/me',
        { token: tokens[i % tokens.length], ip: ipFor(i) }));
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    }
    return out;
  }),
)).flat();
summary.push(report(`sustained ${USERS} users × 5 reads, ~1s apart`, sustained, Date.now() - t5));

console.log('\n════ SUMMARY ════');
for (const s of summary) console.log(`  ${s.name.padEnd(52)} ok ${s.ok}/${s.count}  p95 ${s.p95.toFixed(0)}ms  max ${s.max.toFixed(0)}ms`);
process.exit(0);

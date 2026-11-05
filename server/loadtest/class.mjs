// What a real class does to the API, one step up from run.mjs.
//
// run.mjs asks how many requests a second survive. This asks the question a
// student feels: how long until my screen has finished loading, while everyone
// else in the class is doing the same thing?
//
// Each virtual student behaves like the app:
//   · opening the home screen fires its seven requests together, not in turn
//   · every request accepts gzip, so compression is on the server's bill
//   · /programs is sent with the ETag it was last given, as a browser would
//   · then they read for a while, open another screen, tick a lesson off, and
//     the notification bell polls in the background
//
// Two scenarios:
//   herd   everyone opens the app in the same second -- the class-starts-now
//          push notification, which is the worst minute this API will have
//   ramp   sustained use at rising headcounts, to find where it stops being fine
//
// Throughout, a canary asks /health five times a second. /health does no work,
// so its latency is purely how long the event loop kept it waiting -- the most
// honest single signal of an overloaded Node process.
//
// See README.md for how to run it so the numbers mean something.
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { assertThrowawayDb } from './guard.mjs';

const HOST = process.env.LOAD_HOST || '127.0.0.1';
const PORT = Number(process.env.LOAD_PORT || 4300);
const list = (v) => v.split(',').filter(Boolean).map(Number);
const HERDS = list(process.env.LOAD_HERDS ?? '100,500,1000');
const STEPS = list(process.env.LOAD_STEPS ?? '100,300,500,1000');
const STEP_MS = Number(process.env.LOAD_STEP_SECONDS || 60) * 1000;
const THINK_MS = Number(process.env.LOAD_THINK_MS || 10_000); // mean gap between screens
const BELL_MS = 45_000; // POLL_WITHOUT_PUSH_MS: the worse of the two client intervals
const PID = process.env.LOAD_PID;
const OUT = process.env.LOAD_OUT;
const API = '/api/skeo';

if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET to the same value the server under test was started with.');
const { signAccessToken } = await import('../utils/token.js');

await mongoose.connect(assertThrowawayDb(), { maxPoolSize: 2 });
const db = mongoose.connection.db;
const roster = await db.collection('skeo_users').find({ email: /^load\d+@skeo\.test$/ }).project({ _id: 1 }).toArray();
const program = await db.collection('skeo_programs').findOne({ title: 'Load test course' }, { projection: { modules: 1 } });
await mongoose.disconnect();
if (!roster.length || !program) throw new Error('Nothing seeded. Run loadtest/seed.mjs first.');
const topics = program.modules.flatMap((m) => m.chapters.flatMap((c) => c.topics.map((t) => String(t._id))));
const PROGRAM = String(program._id);

// Minted rather than signed in: login is bcrypt, run.mjs already measures it,
// and 2000 logins first would only measure the patience of whoever runs this.
const students = roster.map((u, i) => ({
  i,
  token: signAccessToken({ _id: u._id, role: 'student' }),
  ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${(i & 255) || 1}`,
  etag: null,
}));

// In production every request arrives through Render's proxy, which reuses its
// connections to this process. Giving each virtual student their own sockets
// measures how fast the OS accepts thousands of TCP connections instead, and
// Windows answers that with ECONNREFUSED, which says nothing about this API.
const SOCKETS = Number(process.env.LOAD_SOCKETS || 512);
const agent = new http.Agent({ keepAlive: true, maxSockets: SOCKETS, maxFreeSockets: SOCKETS });
const canaryAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });

function send(method, path, { student, body, conditional } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const started = performance.now();
  return new Promise((resolve) => {
    const r = http.request({
      host: HOST,
      port: PORT,
      path,
      method,
      agent,
      headers: {
        'accept-encoding': 'gzip',
        ...(student ? { authorization: `Bearer ${student.token}`, 'x-forwarded-for': student.ip } : {}),
        ...(conditional && student?.etag ? { 'if-none-match': student.etag } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.on('end', () => {
        if (conditional && student && res.headers.etag) student.etag = res.headers.etag;
        resolve({ status: res.statusCode, ms: performance.now() - started, bytes });
      });
    });
    r.on('error', (e) => resolve({ status: 0, error: e.code || e.message, ms: performance.now() - started, bytes: 0 }));
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Measurements ────────────────────────────────────────────────────────────
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0);
const stats = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, p50: quantile(s, 0.5), p95: quantile(s, 0.95), p99: quantile(s, 0.99), max: s.at(-1) || 0 };
};
const fmt = (o) => `p50 ${o.p50.toFixed(0).padStart(5)}  p95 ${o.p95.toFixed(0).padStart(5)}  p99 ${o.p99.toFixed(0).padStart(5)}  max ${o.max.toFixed(0).padStart(6)} ms`;

class Tally {
  requests = 0;
  bad = 0;
  bytes = 0;
  codes = {};
  errors = {}; // why a request got no answer at all: status 0 alone explains nothing
  byName = new Map();
  screens = new Map();

  note(name, r) {
    this.requests += 1;
    this.bytes += r.bytes;
    this.codes[r.status] = (this.codes[r.status] || 0) + 1;
    if (r.error) this.errors[r.error] = (this.errors[r.error] || 0) + 1;
    // A 304 is success. Anything else outside 2xx counts against the run,
    // including a 4xx, which would mean this script is asking the wrong thing.
    if (!(r.status >= 200 && r.status < 300) && r.status !== 304) this.bad += 1;
    if (!this.byName.has(name)) this.byName.set(name, []);
    this.byName.get(name).push(r.ms);
  }

  screen(name, ms) {
    if (!this.screens.has(name)) this.screens.set(name, []);
    this.screens.get(name).push(ms);
  }
}

function startCanary() {
  const samples = [];
  let down = 0;
  const t = setInterval(() => {
    const started = performance.now();
    const r = http.get({ host: HOST, port: PORT, path: '/health', agent: canaryAgent }, (res) => {
      res.resume();
      res.on('end', () => samples.push(performance.now() - started));
    });
    r.on('error', () => { down += 1; });
  }, 200);
  return () => { clearInterval(t); return { ...stats(samples), down }; };
}

// Working set of the API process: the instance has 512MB, and going past it is
// a restart in the middle of a class.
function memoryMb() {
  if (!PID) return 0;
  try {
    if (process.platform === 'win32') {
      const line = execSync(`tasklist /FI "PID eq ${PID}" /FO CSV /NH`, { encoding: 'utf8' });
      return Math.round(Number(line.split('","')[4].replace(/[^\d]/g, '')) / 1024);
    }
    return Math.round(Number(execSync(`ps -o rss= -p ${PID}`, { encoding: 'utf8' })) / 1024);
  } catch {
    return 0;
  }
}

// ── What a student does ─────────────────────────────────────────────────────
const get = (t, name, path, student, conditional) =>
  send('GET', API + path, { student, conditional }).then((r) => t.note(name, r));

async function openHome(t, s) {
  const started = performance.now();
  await Promise.all([
    get(t, 'GET /me', '/me', s),
    get(t, 'GET /batches', '/batches', s),
    get(t, 'GET /programs', '/programs', s, true),
    get(t, 'GET /assignments', '/assignments?scope=mine', s),
    get(t, 'GET /announcements', '/announcements', s),
    get(t, 'GET /notifications', '/notifications', s),
    get(t, 'GET /progress/me', '/progress/me', s),
  ]);
  t.screen('home', performance.now() - started);
}

async function openLearning(t, s) {
  const started = performance.now();
  await Promise.all([
    get(t, 'GET /programs', '/programs', s, true),
    get(t, 'GET /batches', '/batches', s),
    get(t, 'GET /quizzes', `/quizzes?programId=${PROGRAM}`, s),
    get(t, 'GET /progress/me', `/progress/me?programId=${PROGRAM}`, s),
  ]);
  t.screen('learning', performance.now() - started);
}

async function openGrades(t, s) {
  const started = performance.now();
  await get(t, 'GET /grades/me', '/grades/me', s);
  t.screen('grades', performance.now() - started);
}

async function tickLesson(t, s) {
  const started = performance.now();
  const topicId = topics[Math.floor(Math.random() * topics.length)];
  t.note('POST /progress/toggle', await send('POST', `${API}/progress/toggle`, {
    student: s,
    body: { programId: PROGRAM, topicId },
  }));
  t.screen('tick', performance.now() - started);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MS * (0.4 + Math.random() * 1.2));

async function live(t, s, until) {
  await sleep(Math.random() * THINK_MS); // spread out here; arriving together is what herd is for
  let nextBell = Date.now() + Math.random() * BELL_MS;
  await openHome(t, s);
  while (Date.now() < until) {
    await think();
    if (Date.now() >= until) break;
    if (Date.now() >= nextBell) {
      nextBell += BELL_MS;
      await get(t, 'GET /notifications', '/notifications', s);
    }
    const roll = Math.random();
    if (roll < 0.45) await openLearning(t, s);
    else if (roll < 0.75) await tickLesson(t, s);
    else if (roll < 0.9) await openHome(t, s);
    else await openGrades(t, s);
  }
}

// ── The run ─────────────────────────────────────────────────────────────────
const results = { students: students.length, lessons: topics.length, herds: [], steps: [] };

function printBreakdown(t) {
  const rows = [...t.byName].map(([name, ms]) => [name, stats(ms)]).sort((a, b) => b[1].p95 - a[1].p95);
  for (const [name, o] of rows) console.log(`    ${name.padEnd(24)} ${String(o.n).padStart(6)}  ${fmt(o)}`);
  return Object.fromEntries(rows);
}

console.log(`${students.length} students seeded, ${topics.length} lessons, server ${HOST}:${PORT}`);
console.log(`memory at start ${memoryMb()}MB\n`);

// Open the sockets a few at a time. Windows clamps the accept backlog to about
// 200, so opening them all in the first herd fails with ECONNREFUSED: a fact
// about this OS and a cold socket pool, and not one a proxy's warm pool has.
for (let open = 50; open <= SOCKETS; open += 50) {
  await Promise.all(Array.from({ length: open }, () => send('GET', '/health')));
}

for (const n of HERDS) {
  if (n > students.length) { console.log(`herd ${n}: skipped, only ${students.length} seeded`); continue; }
  const t = new Tally();
  const stopCanary = startCanary();
  const started = performance.now();
  await Promise.all(students.slice(0, n).map((s) => openHome(t, s)));
  const wall = performance.now() - started;
  const canary = stopCanary();
  const home = stats(t.screens.get('home'));
  console.log(`HERD  ${n} open the app in the same second`);
  console.log(`  home screen finished   ${fmt(home)}`);
  console.log(`  health canary          ${fmt(canary)}`);
  const memory = memoryMb();
  console.log(`  ${t.requests} requests, ${t.bad} failed, ${(t.requests / (wall / 1000)).toFixed(0)} req/s, ${(t.bytes / t.requests / 1024).toFixed(1)}KB avg, ${memory}MB  ${JSON.stringify(t.codes)} ${JSON.stringify(t.errors)}`);
  const endpoints = printBreakdown(t);
  results.herds.push({ n, wallMs: wall, requests: t.requests, bad: t.bad, codes: t.codes, home, canary, memoryMb: memory, endpoints });
  console.log();
  await sleep(3000);
}

for (const n of STEPS) {
  if (n > students.length) { console.log(`ramp ${n}: skipped, only ${students.length} seeded`); continue; }
  const t = new Tally();
  const stopCanary = startCanary();
  const started = performance.now();
  const until = Date.now() + STEP_MS;
  let peakMem = 0;
  const mem = setInterval(() => { peakMem = Math.max(peakMem, memoryMb()); }, 5000);
  await Promise.all(students.slice(0, n).map((s) => live(t, s, until)));
  clearInterval(mem);
  const wall = performance.now() - started;
  const canary = stopCanary();
  const screens = Object.fromEntries([...t.screens].map(([k, v]) => [k, stats(v)]));
  const rps = t.requests / (wall / 1000);
  console.log(`RAMP  ${n} students, ${(wall / 1000).toFixed(0)}s, ~${rps.toFixed(0)} req/s, ${t.bad}/${t.requests} failed, peak ${peakMem}MB  ${JSON.stringify(t.codes)} ${JSON.stringify(t.errors)}`);
  for (const [name, o] of Object.entries(screens)) console.log(`  screen ${name.padEnd(16)} ${String(o.n).padStart(6)}  ${fmt(o)}`);
  console.log(`  health canary          ${String(canary.n).padStart(6)}  ${fmt(canary)}`);
  const endpoints = printBreakdown(t);
  results.steps.push({ n, wallMs: wall, requests: t.requests, rps, bad: t.bad, codes: t.codes, screens, canary, memoryMb: peakMem, endpoints });
  console.log();
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
process.exit(0);

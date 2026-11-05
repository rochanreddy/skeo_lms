// Does a change still show up at once, now that the class's answers are shared?
//
// The companion to blocking.mjs. Everything here writes through the real API as
// an admin, then reads straight back as a student with no delay at all, having
// warmed the cache first so a stale answer would definitely exist. It also
// checks that what is shared stays shared by the right people: one student's
// block must never become another student's view.
//
// It writes, which is why it is here and not in tests/. Run it against the same
// throwaway database as the load test, on a server started with the same
// JWT_SECRET:
//
//   LOAD_PORT=4300 node loadtest/freshness.mjs
import mongoose from 'mongoose';
import { assertThrowawayDb } from './guard.mjs';

const API = `http://127.0.0.1:${process.env.LOAD_PORT || 4300}/api/skeo`;
if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET to the value the server under test was started with.');
const { signAccessToken } = await import('../utils/token.js');

await mongoose.connect(assertThrowawayDb(), { maxPoolSize: 2 });
const users = mongoose.connection.db.collection('skeo_users');
const [one, two, spare] = await users.find({ email: /^load\d+@skeo\.test$/ }).sort({ email: 1 }).limit(3).toArray();
const admin = await users.findOne({ email: 'load-admin@skeo.test' });
const batch = await mongoose.connection.db.collection('skeo_batches').findOne({ name: 'Load test course' });
await mongoose.disconnect();
if (!one || !two || !spare || !admin || !batch) throw new Error('Nothing seeded. Run loadtest/seed.mjs first.');

const token = (u) => signAccessToken(u);
const adminT = token(admin);
const oneT = token(one);
const twoT = token(two);
const spareT = token(spare);

async function call(method, path, t, body) {
  const r = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const get = (path, t) => call('GET', path, t);

let failed = 0;
function check(label, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

const programId = String(batch.programId);
const batchId = String(batch._id);
const stamp = Date.now();
const assignments = (t) => get('/assignments?scope=mine', t).then((d) => d.assignments);
const announcements = (t) => get('/announcements', t).then((d) => d.announcements);
const programs = (t) => get('/programs', t).then((d) => d.programs);
const gates = (t) => get(`/quizzes?programId=${programId}`, t).then((d) => d.quizzes);
const lessons = (t) => get(`/progress/me?programId=${programId}`, t).then((d) => d.total);

// ── Coursework ──────────────────────────────────────────────────────────────
await assignments(oneT);
const { assignment } = await call('POST', '/assignments', adminT, { batchId, title: `Fresh ${stamp}` });
check('a new assignment appears at once', (await assignments(oneT)).some((a) => a.title === `Fresh ${stamp}`));

await call('PATCH', `/assignments/${assignment._id}`, adminT, { title: `Renamed ${stamp}` });
check('an edited assignment changes at once', (await assignments(oneT)).some((a) => a.title === `Renamed ${stamp}`));

await call('DELETE', `/assignments/${assignment._id}`, adminT);
check('a deleted assignment goes at once', !(await assignments(oneT)).some((a) => a.title === `Renamed ${stamp}`));

await announcements(oneT);
await call('POST', '/announcements', adminT, { batchId, title: `News ${stamp}`, body: 'x' });
check('a new announcement appears at once', (await announcements(oneT)).some((a) => a.title === `News ${stamp}`));

// ── Curriculum ──────────────────────────────────────────────────────────────
const before = await lessons(oneT);
const [course] = (await programs(oneT)).filter((p) => p._id === programId);
const firstChapter = course.modules[0].chapters[0];
const grown = structuredClone(course.modules);
grown[0].chapters[0].topics = [...firstChapter.topics, { title: `Lesson ${stamp}`, contentType: 'text' }];
await call('PATCH', `/programs/${programId}`, adminT, { modules: grown });
check('a new lesson is in /programs at once', (await programs(oneT))
  .find((p) => p._id === programId).modules[0].chapters[0].topics.some((x) => x.title === `Lesson ${stamp}`));
check('the lesson count follows it at once', (await lessons(oneT)) === before + 1);
await call('PATCH', `/programs/${programId}`, adminT, { modules: course.modules });
check('and comes back when it is removed', (await lessons(oneT)) === before);

// ── Answers stay with the people allowed them, in either arrival order ──────
const leaks = (qs) => qs.some((q) => (q.questions || []).some((x) => 'correctIndex' in x || 'explanation' in x));
await call('POST', '/assignments', adminT, { batchId, title: `Cache flush ${stamp}` }); // empties the cache
const adminFirst = await gates(adminT);
const studentAfterAdmin = await gates(oneT);
check('the admin sees answers', adminFirst.some((q) => q.questions?.[0]?.correctIndex !== undefined));
check('a student after the admin does not', !leaks(studentAfterAdmin));
await call('POST', '/assignments', adminT, { batchId, title: `Cache flush 2 ${stamp}` });
const studentFirst = await gates(oneT);
const adminAfterStudent = await gates(adminT);
check('a student first does not', !leaks(studentFirst));
check('the admin after a student still does', adminAfterStudent.some((q) => q.questions?.[0]?.correctIndex !== undefined));

// ── One student's block is not another's view ───────────────────────────────
const target = (await assignments(oneT))[0];
const moduleId = String(course.modules[0]._id);
await assignments(oneT);
await assignments(twoT);
await programs(oneT);
await programs(twoT);
await call('PATCH', `/users/${one._id}/blocks`, adminT, { assignmentIds: [target._id], moduleIds: [moduleId] });
check('a blocked assignment disappears for that student at once', !(await assignments(oneT)).some((a) => a._id === target._id));
check('and stays for everyone else', (await assignments(twoT)).some((a) => a._id === target._id));
check('a blocked module disappears for that student at once', !(await programs(oneT))
  .find((p) => p._id === programId).modules.some((m) => String(m._id) === moduleId));
check('and stays for everyone else', (await programs(twoT))
  .find((p) => p._id === programId).modules.some((m) => String(m._id) === moduleId));
await call('PATCH', `/users/${one._id}/blocks`, adminT, { assignmentIds: [], moduleIds: [] });
check('lifting the block restores it at once', (await assignments(oneT)).some((a) => a._id === target._id));

await call('PATCH', `/users/${one._id}/blocks`, adminT, { batchIds: [batchId] });
check('a blocked course disappears for that student at once', (await get('/batches', oneT)).batches.length === 0);
check('with its assignments', (await assignments(oneT)).length === 0);
check('and its announcements', (await announcements(oneT)).length === 0);
check('and stays for everyone else', (await get('/batches', twoT)).batches.length === 1);
await call('PATCH', `/users/${one._id}/blocks`, adminT, { batchIds: [] });
check('lifting that restores it at once', (await get('/batches', oneT)).batches.length === 1);

// ── Enrolment ───────────────────────────────────────────────────────────────
await get('/batches', spareT);
await call('DELETE', `/batches/${batchId}/members/${spare._id}`, adminT);
check('a removed student loses the course at once', (await get('/batches', spareT)).batches.length === 0);
check('and the home screen with it', (await get('/progress/me', spareT)).programId === null);
await call('POST', `/batches/${batchId}/students`, adminT, { email: spare.email });
check('adding them back restores it at once', (await get('/batches', spareT)).batches.length === 1);
check('and the roster count is right', (await get('/batches', spareT)).batches[0].studentCount > 0);

console.log(failed ? `\n${failed} FAILED` : '\nall fresh');
process.exit(failed ? 1 : 0);

// Rich demo data so the dashboards look alive: an admin, a batch of students
// (Jul + Jun cohorts), sessions with Zoom links, attendance, and a quiz with
// attempts. Idempotent — it clears its own demo data first, then recreates.
//   npm run seed:demo
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Session } from '../models/Session.js';
import { Attendance } from '../models/Attendance.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Message } from '../models/Message.js';
import { Doubt } from '../models/Doubt.js';

const DEMO_DOMAIN = '@demo.skeo.in';
const STUDENTS = [
  ['Aarav Sharma', 'aarav'], ['Diya Patel', 'diya'], ['Vihaan Reddy', 'vihaan'],
  ['Ananya Iyer', 'ananya'], ['Arjun Mehta', 'arjun'], ['Isha Nair', 'isha'],
  ['Kabir Singh', 'kabir'], ['Sara Khan', 'sara'],
];

async function run() {
  await connectDb();

  // ── Clear previous demo data ──
  const oldStudents = await User.find({ email: { $regex: `${DEMO_DOMAIN}$` } }).select('_id');
  const oldStudentIds = oldStudents.map((s) => s._id);
  const oldBatches = await Batch.find({ name: /Demo —/ }).select('_id');
  const oldBatchIds = oldBatches.map((b) => b._id);
  const oldSessions = await Session.find({ batchId: { $in: oldBatchIds } }).select('_id');
  const oldQuizzes = await Quiz.find({ batchId: { $in: oldBatchIds } }).select('_id');
  await Attendance.deleteMany({ sessionId: { $in: oldSessions.map((s) => s._id) } });
  await QuizAttempt.deleteMany({ quizId: { $in: oldQuizzes.map((q) => q._id) } });
  await Quiz.deleteMany({ batchId: { $in: oldBatchIds } });
  await Message.deleteMany({ batchId: { $in: oldBatchIds } });
  await Doubt.deleteMany({ batchId: { $in: oldBatchIds } });
  await Session.deleteMany({ batchId: { $in: oldBatchIds } });
  await Batch.deleteMany({ _id: { $in: oldBatchIds } });
  await User.deleteMany({ _id: { $in: oldStudentIds } });
  console.log('• cleared previous demo data');

  // ── Admin: authors the demo announcements and forum answers. ──
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin found -- run `npm run seed` first.');

  // ── Program ──
  let program = await Program.findOne({ title: 'Kickstarter' });
  if (!program) program = await Program.create({ title: 'Kickstarter', type: 'cohort', published: true });

  // ── Batches: Jul + Jun cohorts ──
  const julBatch = await Batch.create({ programId: program._id, name: 'Demo — Kickstarter · Jul 2026', status: 'ongoing' });
  const junBatch = await Batch.create({ programId: program._id, name: 'Demo — Kickstarter · Jun 2026', status: 'past' });
  console.log('✓ batches: Jul 2026 (ongoing), Jun 2026 (past)');

  // ── Students, split across the two batches ──
  const studPass = 'student123';
  const hash = await bcrypt.hash(studPass, 12);
  const students = [];
  for (let i = 0; i < STUDENTS.length; i += 1) {
    const [name, handle] = STUDENTS[i];
    const batch = i < 5 ? julBatch : junBatch; // 5 in Jul, 3 in Jun
    const u = await User.create({ email: `${handle}${DEMO_DOMAIN}`, fullName: name, role: 'student', emailVerified: true, passwordHash: hash, batchIds: [batch._id] });
    await Batch.findByIdAndUpdate(batch._id, { $addToSet: { studentIds: u._id } });
    students.push({ u, batch });
  }
  console.log(`✓ ${students.length} students (password: ${studPass}) — e.g. aarav${DEMO_DOMAIN}`);

  // ── Sessions with Zoom links (Jul batch) ──
  const zoom = 'https://us02web.zoom.us/j/8451234567?pwd=demo';
  const day = 24 * 60 * 60 * 1000;
  const s1 = await Session.create({ batchId: julBatch._id, title: 'Session 1 · AI foundations', startsAt: new Date(Date.now() - 2 * day), joinUrl: zoom });
  const s2 = await Session.create({ batchId: julBatch._id, title: 'Session 2 · Prompting deep-dive', startsAt: new Date(Date.now() - 1 * day), joinUrl: zoom });
  const s3 = await Session.create({ batchId: julBatch._id, title: 'Session 3 · Build a workflow', startsAt: new Date(Date.now() + 2 * day), joinUrl: zoom });
  console.log('✓ 3 sessions with Zoom links');

  // ── Attendance for the two past sessions ──
  const julStudents = students.filter((s) => s.batch._id.equals(julBatch._id)).map((s) => s.u);
  for (const sess of [s1, s2]) {
    for (let i = 0; i < julStudents.length; i += 1) {
      // vary attendance so the graph isn't flat
      const present = (i + (sess === s1 ? 0 : 1)) % 4 !== 0;
      await Attendance.create({ sessionId: sess._id, batchId: julBatch._id, studentId: julStudents[i]._id, status: present ? 'present' : 'absent' });
    }
  }
  console.log('✓ attendance marked for 2 sessions');

  // ── Quiz with attempts ──
  const quiz = await Quiz.create({
    batchId: julBatch._id, title: 'Week 1 · AI basics', type: 'quiz',
    questions: [
      { text: 'What does LLM stand for?', options: ['Large Language Model', 'Long Logic Machine', 'Linear Learning Method'], correctIndex: 0 },
      { text: 'Which is a Claude model family?', options: ['Opus', 'Falcon', 'Titan'], correctIndex: 0 },
      { text: 'A prompt is…', options: ['The model weights', 'The input you give the model', 'A GPU'], correctIndex: 1 },
    ],
  });
  for (let i = 0; i < julStudents.length; i += 1) {
    const answers = [0, i % 2 === 0 ? 0 : 1, 1]; // some get Q2 wrong
    const score = [quiz.questions[0].correctIndex, quiz.questions[1].correctIndex, quiz.questions[2].correctIndex]
      .reduce((s, c, idx) => s + (answers[idx] === c ? 1 : 0), 0);
    await QuizAttempt.create({ quizId: quiz._id, studentId: julStudents[i]._id, answers, score, total: quiz.questions.length });
  }
  console.log('✓ quiz "Week 1 · AI basics" with attempts');

  // ── Forum: group chat + a doubt with a comment + likes ──
  const [a, b, c] = julStudents;
  await Message.create([
    { batchId: julBatch._id, authorId: admin._id, text: 'Welcome to the Jul cohort! Drop a hi 👋' },
    { batchId: julBatch._id, authorId: a._id, text: 'Hi everyone, excited to start!' },
    { batchId: julBatch._id, authorId: b._id, text: 'Same here 🙌' },
  ]);
  await Doubt.create({
    batchId: julBatch._id, authorId: a._id,
    text: 'How is a prompt different from fine-tuning?',
    likes: [b._id, c._id],
    comments: [{ authorId: admin._id, text: 'Great question — a prompt is input at run-time; fine-tuning changes the model weights.' }],
  });
  console.log('✓ forum: chat messages + a doubt with a comment');

  console.log('\n✅ Demo data ready.');
  console.log(`   Student → aarav${DEMO_DOMAIN} / student123`);
  process.exit(0);
}

run().catch((err) => { console.error('Demo seed failed:', err); process.exit(1); });

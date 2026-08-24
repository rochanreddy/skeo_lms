// Rich demo data so the dashboards look alive: an admin, a batch of students
// and a quiz with
// attempts. Idempotent — it clears its own demo data first, then recreates.
//   npm run seed:demo
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';

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
  const oldBatches = await Batch.find({}).select('_id');
  const oldBatchIds = oldBatches.map((b) => b._id);
  const oldQuizzes = await Quiz.find({ batchId: { $in: oldBatchIds } }).select('_id');
  await QuizAttempt.deleteMany({ quizId: { $in: oldQuizzes.map((q) => q._id) } });
  await Quiz.deleteMany({ batchId: { $in: oldBatchIds } });
  await Batch.deleteMany({ _id: { $in: oldBatchIds } });
  await User.deleteMany({ _id: { $in: oldStudentIds } });
  console.log('• cleared previous demo data');

  // ── Admin: authors the demo announcements. ──
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin found -- run `npm run seed` first.');

  // ── Program ──
  let program = await Program.findOne({ title: 'Claude' });
  if (!program) program = await Program.create({ title: 'Claude', type: 'cohort', published: true });

  // ── The one course. No cohorts in this product. ──
  const julBatch = await Batch.create({ programId: program._id, name: program.title, status: 'ongoing' });
  console.log(`✓ course: ${program.title}`);

  // ── Students, split across the two batches ──
  const studPass = 'student123';
  const hash = await bcrypt.hash(studPass, 12);
  const students = [];
  for (let i = 0; i < STUDENTS.length; i += 1) {
    const [name, handle] = STUDENTS[i];
    const batch = julBatch; // everyone joins the same course
    const u = await User.create({ email: `${handle}${DEMO_DOMAIN}`, fullName: name, role: 'student', emailVerified: true, passwordHash: hash, batchIds: [batch._id] });
    await Batch.findByIdAndUpdate(batch._id, { $addToSet: { studentIds: u._id } });
    students.push({ u, batch });
  }
  console.log(`✓ ${students.length} students (password: ${studPass}) — e.g. aarav${DEMO_DOMAIN}`);


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


  console.log('\n✅ Demo data ready.');
  console.log(`   Student → aarav${DEMO_DOMAIN} / student123`);
  process.exit(0);
}

run().catch((err) => { console.error('Demo seed failed:', err); process.exit(1); });

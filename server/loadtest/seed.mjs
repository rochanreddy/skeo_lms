// Seeds a throwaway database with a class that looks like a real one: N
// students on one course, with the curriculum, coursework, notifications and
// progress a home screen actually reads. The earlier version made bare accounts
// in no batch at all, which left every query that depends on enrolment with
// nothing to do -- and those are the queries that matter.
//
// All of them share one password, so the bcrypt hash is computed once.
import 'dotenv/config';
import mongoose from 'mongoose';
import { assertThrowawayDb } from './guard.mjs';
import { hashPassword } from '../utils/password.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Assignment } from '../models/Assignment.js';
import { Quiz } from '../models/Quiz.js';
import { Announcement } from '../models/Announcement.js';
import { Notification } from '../models/Notification.js';
import { Progress } from '../models/Progress.js';
import { Submission } from '../models/Submission.js';
import { MODULES } from '../scripts/claudeCurriculum.js';

const N = Number(process.env.LOAD_USERS || 120);
const PASSWORD = process.env.LOAD_PASSWORD || 'LoadTest123!';
const COURSE = 'Load test course';
const NOTES_EACH = 30; // the most /notifications ever returns
const CHUNK = 5000;

await mongoose.connect(assertThrowawayDb());
console.log('seeding into →', mongoose.connection.name);

const t0 = Date.now();
const passwordHash = await hashPassword(PASSWORD);
console.log(`one hash = ${Date.now() - t0}ms`);

const chunked = async (Model, docs) => {
  for (let i = 0; i < docs.length; i += CHUNK) {
    await Model.insertMany(docs.slice(i, i + CHUNK), { lean: true, ordered: false });
  }
};

// ── Clear the previous run ──────────────────────────────────────────────────
const old = await Batch.find({ name: COURSE }).select('_id').lean();
const oldIds = old.map((b) => b._id);
const oldAssignments = await Assignment.find({ batchId: { $in: oldIds } }).select('_id').lean();
await Submission.deleteMany({ assignmentId: { $in: oldAssignments.map((a) => a._id) } });
await Assignment.deleteMany({ batchId: { $in: oldIds } });
await Announcement.deleteMany({ batchId: { $in: oldIds } });
const oldPrograms = await Program.find({ title: COURSE }).select('_id').lean();
await Quiz.deleteMany({ programId: { $in: oldPrograms.map((p) => p._id) } });
await Progress.deleteMany({ programId: { $in: oldPrograms.map((p) => p._id) } });
await Batch.deleteMany({ _id: { $in: oldIds } });
await Program.deleteMany({ title: COURSE });
const oldUsers = await User.find({ email: /^load(\d+|-admin)@skeo\.test$/ }).select('_id').lean();
await Notification.deleteMany({ userId: { $in: oldUsers.map((u) => u._id) } });
await User.deleteMany({ _id: { $in: oldUsers.map((u) => u._id) } });

// ── The course: the real curriculum, so payloads are the real size ──────────
const program = await Program.create({
  title: COURSE,
  type: 'cohort',
  published: true,
  modules: MODULES.map((m, i) => ({
    title: m.title,
    order: i,
    chapters: [{
      title: 'Lessons',
      order: 0,
      topics: m.lessons.map((l, li) => ({
        title: `${l.code} · ${l.title}`,
        contentType: 'video',
        contentUrl: 'https://example.test/video.mp4',
        order: li,
        body: l.points.map((p) => `- ${p}`).join('\n'),
      })),
    }],
  })),
});
const topicIds = program.modules.flatMap((m) => m.chapters.flatMap((c) => c.topics.map((t) => String(t._id))));

const admin = await User.create({ email: 'load-admin@skeo.test', passwordHash, fullName: 'Load Admin', role: 'admin' });

const students = Array.from({ length: N }, (_, i) => ({
  _id: new mongoose.Types.ObjectId(),
  email: `load${i}@skeo.test`,
  passwordHash,
  fullName: `Load User ${i}`,
  role: 'student',
}));
const batch = await Batch.create({
  programId: program._id,
  name: COURSE,
  status: 'ongoing',
  studentIds: students.map((s) => s._id),
});
await chunked(User, students.map((s) => ({ ...s, batchIds: [batch._id] })));

// ── Coursework ──────────────────────────────────────────────────────────────
const brief = 'Read the brief carefully, then submit a Drive folder with your written deliverable. '.repeat(10);
const assignments = await Assignment.insertMany(Array.from({ length: 12 }, (_, i) => ({
  batchId: batch._id,
  title: `Assignment ${i + 1}`,
  description: brief,
  dueDate: new Date(Date.now() + (i - 6) * 7 * 86_400_000),
})));
await Quiz.insertMany(program.modules.map((m, i) => ({
  programId: program._id,
  moduleId: String(m._id),
  title: `Module ${i + 1} quiz`,
  questions: Array.from({ length: 10 }, (__, q) => ({
    text: `Question ${q + 1} about this module, phrased at a realistic length for a student to read.`,
    options: ['The first option', 'The second option', 'The third option', 'The fourth option'],
    correctIndex: q % 4,
    explanation: 'Why the answer is the answer, in a sentence or two.',
  })),
})));
await Announcement.insertMany(Array.from({ length: 50 }, (_, i) => ({
  batchId: batch._id,
  authorId: admin._id,
  title: `Announcement ${i + 1}`,
  body: 'Something the whole class needs to know, in a short paragraph. '.repeat(4),
})));

// ── Per-student rows, which is what makes the collections big ───────────────
const now = Date.now();
await chunked(Notification, students.flatMap((s) => Array.from({ length: NOTES_EACH }, (_, i) => ({
  userId: s._id,
  type: 'announcement',
  text: `Notification ${i + 1}: something happened in your course.`,
  link: '/app/learning',
  read: i > 3,
  createdAt: new Date(now - i * 3_600_000),
}))));
await chunked(Progress, students.map((s, i) => ({
  studentId: s._id,
  programId: program._id,
  completedTopics: topicIds.slice(0, i % topicIds.length),
})));
await chunked(Submission, students.flatMap((s) => assignments.slice(0, 6).map((a) => ({
  assignmentId: a._id,
  studentId: s._id,
  driveLink: 'https://drive.google.com/drive/folders/example',
  status: 'graded',
  score: 80,
}))));

console.log(`seeded ${N} students on "${COURSE}" (${topicIds.length} lessons) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await mongoose.disconnect();

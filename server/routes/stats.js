import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Attendance } from '../models/Attendance.js';
import { Progress } from '../models/Progress.js';
import { canManageBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/skeo/stats/overview — admin platform analytics: headline counts +
// student distribution per batch (for the chart).
router.get('/overview', requireAuth, requireRole('admin'), async (_req, res) => {
  const [students, batches, programs, quizzes] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Batch.countDocuments(),
    Program.countDocuments(),
    Quiz.countDocuments(),
  ]);
  const batchDocs = await Batch.find().select('name studentIds').sort({ createdAt: -1 });
  const perBatch = batchDocs.map((b) => ({ name: b.name.replace(/^Demo — /, ''), count: b.studentIds.length }));
  res.json({ stats: { students, batches, programs, quizzes }, perBatch });
});

// GET /api/skeo/stats/admin-dashboard — everything the admin dashboard charts
// need in one round trip: role/batch/submission/attendance distributions,
// enrolment per batch, and student signups over the last 8 weeks.
router.get('/admin-dashboard', requireAuth, requireRole('admin'), async (_req, res) => {
  const [students, batches, programs, quizzes, blockedUsers] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Batch.countDocuments(),
    Program.countDocuments(),
    Quiz.countDocuments(),
    User.countDocuments({ 'blocked.lms': true }),
  ]);

  const [batchDocs, assignmentDocs, submissionAgg, attendanceAgg, recentStudents] = await Promise.all([
    Batch.find().select('name status studentIds').sort({ createdAt: -1 }),
    Assignment.find().select('type'),
    Submission.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Attendance.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.find({ role: 'student', createdAt: { $gte: new Date(Date.now() - 8 * 7 * 24 * 3600 * 1000) } }).select('createdAt'),
  ]);

  const count = (agg, key) => agg.find((a) => a._id === key)?.n || 0;

  // Weekly signup buckets, oldest → newest.
  const WEEK = 7 * 24 * 3600 * 1000;
  const now = Date.now();
  const signups = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * WEEK;
    const end = start + WEEK;
    const label = new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return { label, count: recentStudents.filter((u) => { const t = u.createdAt.getTime(); return t >= start && t < end; }).length };
  });

  res.json({
    stats: { students, batches, programs, quizzes, blockedUsers },
    batchStatus: ['ongoing', 'upcoming', 'past'].map((s) => ({ label: s, count: batchDocs.filter((b) => b.status === s).length })),
    assignmentTypes: ['assignment', 'project'].map((t) => ({ label: t, count: assignmentDocs.filter((a) => a.type === t).length })),
    submissionStatus: [
      { label: 'graded', count: count(submissionAgg, 'graded') },
      { label: 'awaiting review', count: count(submissionAgg, 'submitted') },
    ],
    attendance: [
      { label: 'present', count: count(attendanceAgg, 'present') },
      { label: 'absent', count: count(attendanceAgg, 'absent') },
    ],
    perBatch: batchDocs.map((b) => ({ name: b.name.replace(/^Demo — /, ''), count: b.studentIds.length })),
    signups,
  });
});

// ── At-risk detection ──

const DAY = 24 * 60 * 60 * 1000;
const key = (studentId, scopeId) => `${studentId}:${scopeId}`;

/**
 * Turn one student's engagement metrics into a risk score plus the reasons
 * behind it. Signals are independent and additive — a student failing on two
 * fronts outranks one who's merely quiet. Every signal carries a human-readable
 * reason so the admin sees WHAT to act on, not just a number.
 *
 * Each signal stays silent until there's enough data to justify it (e.g. no
 * attendance verdict before 3 marked sessions), which keeps a brand-new cohort
 * from lighting up red on day one.
 */
function assess(m) {
  const reasons = [];
  let score = 0;
  const flag = (points, label, detail) => { score += points; reasons.push({ label, detail }); };

  if (m.attendanceTotal >= 3) {
    if (m.attendancePct < 50) flag(3, 'Low attendance', `${m.attendancePct}% present`);
    else if (m.attendancePct < 70) flag(2, 'Slipping attendance', `${m.attendancePct}% present`);
  }

  if (m.missedAssignments >= 2) flag(3, 'Missing work', `${m.missedAssignments} assignments overdue`);
  else if (m.missedAssignments === 1) flag(1, 'Missing work', '1 assignment overdue');

  if (m.quizzesTaken >= 1) {
    if (m.quizAvg < 40) flag(3, 'Failing quizzes', `${m.quizAvg}% average`);
    else if (m.quizAvg < 60) flag(2, 'Struggling on quizzes', `${m.quizAvg}% average`);
  } else if (m.quizzesAvailable >= 2) {
    flag(2, 'No quizzes attempted', `${m.quizzesAvailable} available`);
  }

  // null = never seen since lastActiveAt was introduced. That's missing data,
  // not evidence of absence, so it contributes nothing rather than a false flag.
  if (m.daysInactive !== null) {
    if (m.daysInactive >= 14) flag(3, 'Inactive', `${m.daysInactive} days since last sign-in`);
    else if (m.daysInactive >= 7) flag(2, 'Going quiet', `${m.daysInactive} days since last sign-in`);
  }

  if (m.lessonTotal >= 5 && m.lessonPct < 25) flag(2, 'Course barely started', `${m.lessonPct}% of lessons done`);

  return { score, level: score >= 6 ? 'high' : score >= 3 ? 'medium' : 'ok', reasons };
}

// GET /api/skeo/stats/at-risk?batchId=..
// Students showing signs of falling behind, worst first. Defaults to every batch
// the caller can see (admins get all of them). One row per student-per-batch,
// since a student can be on track in one cohort and struggling in another.
router.get('/at-risk', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId } = req.query;
  // Guard the cast: a malformed id would otherwise throw and surface as a 500.
  if (batchId && !mongoose.isValidObjectId(batchId)) return res.status(400).json({ error: 'Invalid batchId.' });
  if (batchId && !canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const batchIds = batchId ? [batchId] : await myBatchIds(req.user);

  const batches = await Batch.find({ _id: { $in: batchIds } }).select('name studentIds programId');
  const studentIds = [...new Set(batches.flatMap((b) => b.studentIds.map(String)))];
  if (studentIds.length === 0) return res.json({ students: [], scanned: 0 });

  const programIds = [...new Set(batches.map((b) => b.programId).filter(Boolean).map(String))];

  // Fetch every signal in two batched rounds, then score in memory. Per-student
  // queries would be N+1 and get slow the moment a cohort grows.
  const [users, attendance, assignments, quizzes, programs, progress] = await Promise.all([
    User.find({ _id: { $in: studentIds } }).select('fullName email lastActiveAt'),
    Attendance.find({ batchId: { $in: batchIds }, studentId: { $in: studentIds } }).select('studentId batchId status'),
    Assignment.find({ batchId: { $in: batchIds } }).select('batchId dueDate'),
    Quiz.find({ batchId: { $in: batchIds } }).select('batchId'),
    Program.find({ _id: { $in: programIds } }).select('modules'),
    Progress.find({ studentId: { $in: studentIds }, programId: { $in: programIds } }).select('studentId programId completedTopics'),
  ]);

  const [submissions, attempts] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) }, studentId: { $in: studentIds } }).select('assignmentId studentId'),
    QuizAttempt.find({ quizId: { $in: quizzes.map((q) => q._id) }, studentId: { $in: studentIds } }).select('quizId studentId score total'),
  ]);

  // ── Lookup tables ──
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const submitted = new Set(submissions.map((s) => `${s.assignmentId}:${s.studentId}`));
  const batchOfQuiz = new Map(quizzes.map((q) => [q._id.toString(), q.batchId.toString()]));

  const lessonTotals = new Map(programs.map((p) => [
    p._id.toString(),
    (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0),
  ]));

  const attByKey = new Map();
  for (const a of attendance) {
    if (!a.batchId) continue;
    const k = key(a.studentId, a.batchId);
    const v = attByKey.get(k) || { present: 0, total: 0 };
    v.total += 1;
    if (a.status === 'present') v.present += 1;
    attByKey.set(k, v);
  }

  const attemptsByKey = new Map();
  for (const a of attempts) {
    const bid = batchOfQuiz.get(a.quizId.toString());
    if (!bid) continue;
    const k = key(a.studentId, bid);
    attemptsByKey.set(k, [...(attemptsByKey.get(k) || []), a]);
  }

  const progressByKey = new Map(progress.map((p) => [key(p.studentId, p.programId), (p.completedTopics || []).length]));

  // ── Score every student in every batch ──
  const now = Date.now();
  const rows = [];

  for (const b of batches) {
    const bid = b._id.toString();
    const pid = b.programId ? b.programId.toString() : null;
    const overdue = assignments.filter((a) => a.batchId.toString() === bid && a.dueDate && new Date(a.dueDate).getTime() < now);
    const quizzesAvailable = quizzes.filter((q) => q.batchId.toString() === bid).length;
    const lessonTotal = (pid && lessonTotals.get(pid)) || 0;

    for (const sid of b.studentIds.map(String)) {
      const u = userById.get(sid);
      if (!u) continue;

      const att = attByKey.get(key(sid, bid)) || { present: 0, total: 0 };
      const myAttempts = attemptsByKey.get(key(sid, bid)) || [];
      const doneLessons = (pid && progressByKey.get(key(sid, pid))) || 0;

      const metrics = {
        attendancePct: att.total ? Math.round((att.present / att.total) * 100) : 0,
        attendanceTotal: att.total,
        missedAssignments: overdue.filter((a) => !submitted.has(`${a._id}:${sid}`)).length,
        quizAvg: myAttempts.length
          ? Math.round(myAttempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / myAttempts.length)
          : 0,
        quizzesTaken: myAttempts.length,
        quizzesAvailable,
        lessonPct: lessonTotal ? Math.round((Math.min(doneLessons, lessonTotal) / lessonTotal) * 100) : 0,
        lessonTotal,
        daysInactive: u.lastActiveAt ? Math.floor((now - u.lastActiveAt.getTime()) / DAY) : null,
      };

      const { score, level, reasons } = assess(metrics);
      if (level === 'ok') continue;

      rows.push({
        id: sid,
        name: u.fullName || u.email,
        email: u.email,
        batch: { id: bid, name: b.name.replace(/^Demo — /, '') },
        level,
        score,
        reasons,
        metrics,
      });
    }
  }

  rows.sort((a, b) => b.score - a.score);
  res.json({ students: rows, scanned: studentIds.length });
});

export default router;

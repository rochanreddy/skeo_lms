import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Batch } from '../models/Batch.js';
import { canManageBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/skeo/grades/me — the student's consolidated gradebook: every
// assignment and quiz across their batches, with their own score/status.
router.get('/me', requireAuth, async (req, res) => {
  const batchIds = await myBatchIds(req.user);
  const [assignments, quizzes] = await Promise.all([
    Assignment.find({ batchId: { $in: batchIds } }).sort({ createdAt: -1 }),
    Quiz.find({ batchId: { $in: batchIds } }).sort({ createdAt: -1 }),
  ]);
  const [subs, attempts] = await Promise.all([
    Submission.find({ studentId: req.user._id, assignmentId: { $in: assignments.map((a) => a._id) } }),
    QuizAttempt.find({ studentId: req.user._id, quizId: { $in: quizzes.map((q) => q._id) } }),
  ]);
  const subBy = new Map(subs.map((s) => [s.assignmentId.toString(), s]));
  const attBy = new Map(attempts.map((a) => [a.quizId.toString(), a]));

  const rows = [
    ...assignments.map((a) => {
      const s = subBy.get(a._id.toString());
      return {
        id: a._id, kind: 'Assignment', title: a.title,
        status: s ? s.status : 'pending',
        score: s && s.score != null ? s.score : null,
        max: 10, // assignments graded out of 10
        feedback: s?.feedback || '',
        at: a.createdAt,
      };
    }),
    ...quizzes.map((q) => {
      const at = attBy.get(q._id.toString());
      return {
        id: q._id, kind: q.type === 'exam' ? 'Exam' : 'Quiz', title: q.title,
        status: at ? 'graded' : 'pending',
        score: at ? at.score : null,
        max: at ? at.total : q.questions?.length ?? null,
        feedback: '',
        at: q.createdAt,
      };
    }),
  ].sort((x, y) => new Date(y.at) - new Date(x.at));

  // Average across quiz/exam percentages (the only ones with a defined max).
  const pcts = rows.filter((r) => r.max && r.score != null).map((r) => (r.score / r.max) * 100);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const graded = rows.filter((r) => r.status === 'graded').length;

  res.json({ rows, summary: { total: rows.length, graded, avgPct } });
});

// GET /api/skeo/grades/batch/:batchId — admin gradebook grid: a matrix of
// every student in the batch against every assessment.
router.get('/batch/:batchId', requireAuth, async (req, res) => {
  const { batchId } = req.params;
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const batch = await Batch.findById(batchId).populate('studentIds', 'fullName email');
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });

  const [assignments, quizzes] = await Promise.all([
    Assignment.find({ batchId }).sort({ createdAt: 1 }),
    Quiz.find({ batchId }).sort({ createdAt: 1 }),
  ]);
  const [subs, attempts] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) } }),
    QuizAttempt.find({ quizId: { $in: quizzes.map((q) => q._id) } }),
  ]);

  const columns = [
    ...assignments.map((a) => ({ id: a._id.toString(), kind: 'assignment', title: a.title, max: 10 })),
    ...quizzes.map((q) => ({ id: q._id.toString(), kind: 'quiz', title: q.title, max: q.questions?.length ?? null })),
  ];

  // index: `${kind}:${assessmentId}:${studentId}` → cell
  const cell = new Map();
  subs.forEach((s) => cell.set(`assignment:${s.assignmentId}:${s.studentId}`, { status: s.status, score: s.score }));
  attempts.forEach((a) => cell.set(`quiz:${a.quizId}:${a.studentId}`, { status: 'graded', score: a.score, max: a.total }));

  const rows = (batch.studentIds || []).map((st) => {
    const cells = columns.map((c) => cell.get(`${c.kind}:${c.id}:${st._id}`) || { status: 'pending', score: null });
    const pcts = cells
      .map((cv, i) => (columns[i].max && cv.score != null ? (cv.score / columns[i].max) * 100 : null))
      .filter((v) => v != null);
    return {
      studentId: st._id, name: st.fullName || st.email, email: st.email,
      cells,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    };
  });

  res.json({ batch: { id: batch._id, name: batch.name }, columns, rows });
});

export default router;

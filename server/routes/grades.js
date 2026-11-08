import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Batch } from '../models/Batch.js';
import { canManageBatch, myBatchIds } from '../utils/access.js';
import { classCache } from '../utils/classCache.js';
import { courseOrder } from '../utils/courseOrder.js';

const router = Router();

/* A gradebook never needs a quiz's questions -- only how many there are, to
 * divide a score by. Fetching them anyway meant every question's text, every
 * option and every explanation crossing the wire so that `.length` could be
 * read off the array: by far the biggest field on the document, and the one
 * thing here nobody is going to look at. $size does the count in the database
 * and sends an integer.
 *
 * `batchId` is carried because the admin grid groups by it. */
const quizColumns = (match, order) => Quiz.aggregate([
  { $match: match },
  { $sort: { createdAt: order } },
  { $project: { title: 1, type: 1, createdAt: 1, batchId: 1, qCount: { $size: { $ifNull: ['$questions', []] } } } },
]);

// GET /api/skeo/grades/me: the student's consolidated gradebook: every
// assignment and quiz across their batches, with their own score/status.
router.get('/me', requireAuth, async (req, res) => {
  const batchIds = await myBatchIds(req.user);
  // Every query here is projected to the handful of fields the rows below read,
  // and lean, because none of it is anything but JSON on the way out.
  const [assignments, quizzes] = await Promise.all([
    classCache.get(`grade-assignments:${batchIds.join()}`, () => (
      Assignment.find({ batchId: { $in: batchIds } }).select('title type createdAt').lean()
    )),
    classCache.get(`grade-quizzes:${batchIds.join()}`, () => quizColumns({ batchId: { $in: batchIds } }, -1)),
  ]);
  const [subs, attempts] = await Promise.all([
    Submission.find({ studentId: req.user._id, assignmentId: { $in: assignments.map((a) => a._id) } })
      .select('assignmentId status score feedback').lean(),
    QuizAttempt.find({ studentId: req.user._id, quizId: { $in: quizzes.map((q) => q._id) } })
      .select('quizId score total').lean(),
  ]);
  const subBy = new Map(subs.map((s) => [s.assignmentId.toString(), s]));
  const attBy = new Map(attempts.map((a) => [a.quizId.toString(), a]));

  const rows = [
    ...assignments.map((a) => {
      const s = subBy.get(a._id.toString());
      return {
        id: a._id, kind: a.type === 'project' ? 'Project' : 'Assignment', title: a.title,
        status: s ? s.status : 'pending',
        score: s && s.score != null ? s.score : null,
        max: 10, // assignments graded out of 10
        feedback: s?.feedback || '',
        at: a.createdAt,
      };
    }).sort(courseOrder),
    ...quizzes.map((q) => {
      const at = attBy.get(q._id.toString());
      return {
        id: q._id, kind: q.type === 'exam' ? 'Exam' : 'Quiz', title: q.title,
        status: at ? 'graded' : 'pending',
        score: at ? at.score : null,
        max: at ? at.total : q.qCount ?? null,
        feedback: '',
        at: q.createdAt,
      };
    }).sort(courseOrder),
  ];

  // Average across quiz/exam percentages (the only ones with a defined max).
  const pcts = rows.filter((r) => r.max && r.score != null).map((r) => (r.score / r.max) * 100);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const graded = rows.filter((r) => r.status === 'graded').length;

  res.json({ rows, summary: { total: rows.length, graded, avgPct } });
});

// GET /api/skeo/grades/batch/:batchId, admin gradebook grid: a matrix of
// every student in the batch against every assessment.
router.get('/batch/:batchId', requireAuth, async (req, res) => {
  const { batchId } = req.params;
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  // aggregate() does no casting of its own, so a malformed id has to be caught
  // here rather than thrown deep in the pipeline. 404 and this exact wording,
  // because that is what the CastError used to become (middleware/errors.js):
  // an id that could never name a batch and one that is simply not there look
  // the same from outside, and that is deliberate.
  if (!mongoose.isValidObjectId(batchId)) return res.status(404).json({ error: 'Not found.' });
  const batch = await Batch.findById(batchId).select('name studentIds').populate('studentIds', 'fullName email').lean();
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });

  const [assignments, quizzes] = await Promise.all([
    Assignment.find({ batchId }).select('title').sort({ createdAt: 1 }).lean(),
    quizColumns({ batchId: new mongoose.Types.ObjectId(String(batchId)) }, 1),
  ]);
  const [subs, attempts] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) } })
      .select('assignmentId studentId status score').lean(),
    QuizAttempt.find({ quizId: { $in: quizzes.map((q) => q._id) } })
      .select('quizId studentId score total').lean(),
  ]);

  const columns = [
    ...assignments.map((a) => ({ id: a._id.toString(), kind: 'assignment', title: a.title, max: 10 })),
    ...quizzes.map((q) => ({ id: q._id.toString(), kind: 'quiz', title: q.title, max: q.qCount ?? null })),
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

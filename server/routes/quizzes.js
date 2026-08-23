import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Batch } from '../models/Batch.js';
import { canAccessBatch, canManageBatch, myBatchIds } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

// GET /api/skeo/quizzes?batchId=..  OR  ?scope=mine
// Admins see full quizzes (with answers). Students see answer-stripped
// quizzes, each with their own attempt (if any) attached.
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const quizzes = await Quiz.find(filter).populate('batchId', 'name').sort({ createdAt: -1 });

  if (req.user.role === 'student' || scope === 'mine') {
    const attempts = await QuizAttempt.find({ studentId: req.user._id, quizId: { $in: quizzes.map((q) => q._id) } });
    const byId = new Map(attempts.map((a) => [a.quizId.toString(), a]));
    return res.json({
      quizzes: quizzes.map((q) => ({ ...q.forStudent(), batchId: q.batchId, myAttempt: byId.get(q._id.toString()) || null })),
    });
  }
  res.json({ quizzes });
});

// GET /api/skeo/quizzes/:id — student gets answer-stripped; admin gets full.
router.get('/:id', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!(await canAccessBatch(req.user, quiz.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  if (req.user.role === 'student') {
    const myAttempt = await QuizAttempt.findOne({ quizId: quiz._id, studentId: req.user._id });
    return res.json({ quiz: quiz.forStudent(), myAttempt });
  }
  res.json({ quiz });
});

// POST /api/skeo/quizzes — admin creates a quiz/exam.
router.post('/', requireAuth, async (req, res) => {
  const { batchId, title, type, questions } = req.body || {};
  if (!batchId || !title) return res.status(400).json({ error: 'batchId and title are required.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const quiz = await Quiz.create({
    batchId,
    title,
    type: type === 'exam' ? 'exam' : 'quiz',
    questions: (Array.isArray(questions) ? questions : []).map((q) => ({
      text: q.text || '',
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: Number(q.correctIndex) || 0,
      explanation: (q.explanation || '').trim(),
    })),
  });
  const batch = await Batch.findById(batchId).select('studentIds');
  notifyMany(batch?.studentIds || [], { type: 'quiz', text: `New ${quiz.type}: ${title}`, link: '/app/learning' });
  res.status(201).json({ quiz });
});

// POST /api/skeo/quizzes/:id/attempt  { answers: [idx,...] } — student attempts once.
router.post('/:id/attempt', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!(await canAccessBatch(req.user, quiz.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });
  if (await QuizAttempt.findOne({ quizId: quiz._id, studentId: req.user._id })) {
    return res.status(409).json({ error: 'You have already attempted this quiz.' });
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const score = quiz.questions.reduce((s, q, i) => s + (answers[i] === q.correctIndex ? 1 : 0), 0);
  const attempt = await QuizAttempt.create({ quizId: quiz._id, studentId: req.user._id, answers, score, total: quiz.questions.length });
  res.status(201).json({ attempt });
});

// GET /api/skeo/quizzes/:id/review — question-by-question feedback on an attempt:
// what the student picked, the right answer, and the author's explanation.
// Gated on an attempt existing, so answers can never be fetched before sitting
// the quiz. Admins may review a specific student via ?studentId=.
router.get('/:id/review', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!(await canAccessBatch(req.user, quiz.batchId))) return res.status(403).json({ error: 'Forbidden.' });

  // Students are always pinned to their own attempt — ?studentId= is ignored
  // for them so it can't be used to read a classmate's answers.
  const requested = req.user.role === 'student' ? null : req.query.studentId;
  if (requested && !mongoose.isValidObjectId(requested)) return res.status(400).json({ error: 'Invalid studentId.' });
  const studentId = requested || req.user._id;

  const attempt = await QuizAttempt.findOne({ quizId: quiz._id, studentId });
  if (!attempt) return res.status(404).json({ error: 'No attempt to review yet.' });

  const questions = quiz.questions.map((q, i) => {
    // -1 is the "unanswered" sentinel the client sends; normalise it to null.
    const picked = attempt.answers[i];
    const myAnswer = Number.isInteger(picked) && picked >= 0 ? picked : null;
    return {
      _id: q._id,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation || '',
      myAnswer,
      isCorrect: myAnswer === q.correctIndex,
    };
  });

  res.json({
    quiz: { _id: quiz._id, title: quiz.title, type: quiz.type },
    attempt: { score: attempt.score, total: attempt.total, at: attempt.createdAt },
    questions,
  });
});

// GET /api/skeo/quizzes/:id/results — admin sees all attempts.
router.get('/:id/results', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const attempts = await QuizAttempt.find({ quizId: quiz._id }).populate('studentId', 'fullName email').sort({ score: -1 });
  res.json({ quiz: { _id: quiz._id, title: quiz.title, total: quiz.questions.length }, attempts });
});

export default router;

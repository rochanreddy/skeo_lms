import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizAttemptArchive } from '../models/QuizAttemptArchive.js';

/**
 * Reset these quizzes for everyone: their attempts move to the archive
 * (models/QuizAttemptArchive.js) and leave skeo_quiz_attempts, so each
 * student sees the quiz as not taken and sits it again.
 *
 * Copied before deleted, so a failure part way leaves an attempt in both
 * places at worst, never in neither.
 *
 * @returns {Promise<number>} attempts reset
 */
export async function resetQuizAttempts(quizIds, reason) {
  if (!quizIds.length) return 0;
  const attempts = await QuizAttempt.find({ quizId: { $in: quizIds } }).lean();
  if (!attempts.length) return 0;
  await QuizAttemptArchive.insertMany(attempts.map((a) => ({
    quizId: a.quizId,
    studentId: a.studentId,
    answers: a.answers,
    score: a.score,
    total: a.total,
    attemptedAt: a.createdAt,
    reason,
  })));
  await QuizAttempt.deleteMany({ _id: { $in: attempts.map((a) => a._id) } });
  return attempts.length;
}

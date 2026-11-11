import mongoose from 'mongoose';

// Quiz attempts taken off the books by a reset (utils/quizReset.js): the quiz
// shows as not taken again, so the student sits it fresh, but the attempt is
// kept here rather than destroyed. Nothing grades or reports from this; the
// one thing it still does is keep a module gate open (routes/quizzes.js), so
// a reset never locks a student out of modules they had already reached.
const quizAttemptArchiveSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    answers: { type: [Number], default: [] },
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    attemptedAt: { type: Date, default: null },
    reason: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'resetAt', updatedAt: false } },
);

quizAttemptArchiveSchema.index({ studentId: 1, quizId: 1 });

export const QuizAttemptArchive = mongoose.model('QuizAttemptArchive', quizAttemptArchiveSchema, 'skeo_quiz_attempts_reset');

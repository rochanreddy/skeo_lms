import mongoose from 'mongoose';

// A student's single attempt at a quiz, auto-graded on submit.
const quizAttemptSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    answers: { type: [Number], default: [] }, // selected option index per question
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { timestamps: true },
);

quizAttemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true });

// Same reason as Submission: the gradebook asks "this student's attempts, for
// these quizzes", and the unique index above leads with the quiz.
quizAttemptSchema.index({ studentId: 1, quizId: 1 });

export const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema, 'skeo_quiz_attempts');

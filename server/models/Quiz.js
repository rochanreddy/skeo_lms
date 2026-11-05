import mongoose from 'mongoose';
import { keepsClassCacheFresh } from '../utils/classCache.js';

// A quiz or exam set for a batch. Admins author it; students attempt it once.
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    options: { type: [String], default: [] }, // 2–6 choices
    correctIndex: { type: Number, default: 0 }, // index into options
    // Why the correct answer is correct — shown to the student only after they
    // attempt, so the quiz teaches instead of just scoring. Optional.
    explanation: { type: String, default: '' },
  },
  { _id: true },
);

const quizSchema = new mongoose.Schema(
  {
    // A quiz belongs EITHER to a batch (the classic batch quiz an admin posts)
    // OR to a curriculum module (the gate between one module and the next).
    // Exactly one of batchId / moduleId is set; see routes/quizzes.js.
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    // Module gate: attempting this quiz unlocks the next module of the program.
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null, index: true },
    moduleId: { type: String, default: '', index: true }, // Program.modules[]._id
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['quiz', 'exam'], default: 'quiz', index: true },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true },
);

// The batch gradebook and the per-module lesson gates, which are the two ways
// quizzes are ever listed.
quizSchema.index({ batchId: 1, createdAt: -1 });
quizSchema.index({ programId: 1, moduleId: 1 });

keepsClassCacheFresh(quizSchema);

/* The exact field list of the student-facing shape, as a projection.
 *
 * A route that is only ever going to send a student their quiz selects THIS,
 * so the correct answers and the author's explanations are never read out of
 * the database at all -- rather than fetched, hydrated, and then dropped on
 * the way out. Faster, and answers cannot leak from a shape that never held
 * them. _id comes along free at both levels.
 *
 * Keep it in step with forStudent() below; they describe the same shape. */
export const QUIZ_STUDENT_FIELDS = 'batchId programId moduleId title type questions._id questions.text questions.options';

// Student-facing shape: never leaks the correct answers.
quizSchema.methods.forStudent = function forStudent() {
  return {
    _id: this._id,
    batchId: this.batchId,
    programId: this.programId,
    moduleId: this.moduleId,
    title: this.title,
    type: this.type,
    questions: this.questions.map((q) => ({ _id: q._id, text: q.text, options: q.options })),
  };
};

export const Quiz = mongoose.model('Quiz', quizSchema, 'skeo_quizzes');

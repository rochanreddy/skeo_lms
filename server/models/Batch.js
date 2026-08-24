import mongoose from 'mongoose';

// A cohort of one program (e.g. "Kickstarter — July 2026"). Admins run it,
// students are enrolled. Assignments and quizzes reference batchId.
const batchSchema = new mongoose.Schema(
  {
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    name: { type: String, required: true, trim: true },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    status: { type: String, enum: ['ongoing', 'past', 'upcoming'], default: 'upcoming', index: true },
  },
  { timestamps: true },
);

export const Batch = mongoose.model('Batch', batchSchema, 'skeo_batches');

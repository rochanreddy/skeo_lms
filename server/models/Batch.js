import mongoose from 'mongoose';

// A cohort of one program (e.g. "Claude"). Admins run it,
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

// "Which batches is this student in?" is the single most-asked question in the
// app: myBatchIds() answers it for /batches, /assignments, /announcements,
// /grades and ⌘K search, canAccessBatch() for every batch-scoped route, and
// hasPaidAccess() on every sign-in. Without an index on the roster each of
// those read every batch document in the collection -- and each document
// carries its whole studentIds array, so the scan got more expensive with
// every enrolment. A multikey index on studentIds turns it into a lookup, and
// because _id comes free in any index, `.select('_id')` is answered from the
// index alone without touching a document.
batchSchema.index({ studentIds: 1 });
// The admin batch list, newest first.
batchSchema.index({ createdAt: -1 });

export const Batch = mongoose.model('Batch', batchSchema, 'skeo_batches');

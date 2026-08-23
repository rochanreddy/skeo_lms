import mongoose from 'mongoose';

// Per-student, per-program lesson progress. completedTopics holds the topic
// sub-document ids the student has marked complete in the curriculum tree.
const progressSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    completedTopics: [{ type: String }],
    certificateIssuedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

progressSchema.index({ studentId: 1, programId: 1 }, { unique: true });

export const Progress = mongoose.model('Progress', progressSchema, 'skeo_progress');

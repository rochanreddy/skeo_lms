import mongoose from 'mongoose';

// An assignment or project set for a batch. Students submit; admins grade.
const assignmentSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    type: { type: String, enum: ['assignment', 'project'], default: 'assignment', index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Submissions open at startDate and close at dueDate. Both optional —
    // null start means "open immediately", null due means "no cutoff".
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    // File types a Drive-folder submission must contain to pass verification.
    // Listing 'html' also opts this assignment out of the default HTML block.
    // See utils/driveVerify.js.
    requiredDriveTypes: {
      type: [String],
      enum: ['video', 'image', 'doc', 'slides', 'html'],
      default: ['video', 'image', 'doc'],
    },
  },
  { timestamps: true },
);

export const Assignment = mongoose.model('Assignment', assignmentSchema, 'skeo_assignments');

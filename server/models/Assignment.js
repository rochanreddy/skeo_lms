import mongoose from 'mongoose';
import { keepsClassCacheFresh } from '../utils/classCache.js';

// An assignment or project set for a batch. Students submit; admins grade.
const assignmentSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    type: { type: String, enum: ['assignment', 'project'], default: 'assignment', index: true },
    title: { type: String, required: true, trim: true },
    // The brief, in Markdown, the written half of the content pane.
    description: { type: String, default: '' },
    // Taught content, exactly as a lesson carries it: a video that plays inline
    // and a PDF that opens in the in-page viewer. Both optional.
    videoUrl: { type: String, default: '' },
    pdfUrl: { type: String, default: '' },
    // Submissions open at startDate and close at dueDate. Both optional,
    // null start means "open immediately", null due means "no cutoff".
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    // File types a Drive-folder submission must contain to pass verification.
    // Written deliverables only: no video or photo requirements.
    // Listing 'html' also opts this assignment out of the default HTML block.
    // See utils/driveVerify.js.
    requiredDriveTypes: {
      type: [String],
      enum: ['doc', 'slides', 'html'],
      default: ['doc'],
    },
  },
  { timestamps: true },
);

// Both shapes the lists come in: newest-first for the board, due-date order
// for a student's schedule and for ⌘K. The leading batchId also serves the
// plain `find({ batchId })` and `find({ batchId: { $in } })` filters.
assignmentSchema.index({ batchId: 1, createdAt: -1 });
assignmentSchema.index({ batchId: 1, dueDate: 1 });

keepsClassCacheFresh(assignmentSchema);

export const Assignment = mongoose.model('Assignment', assignmentSchema, 'skeo_assignments');

import mongoose from 'mongoose';

// A file discovered inside a submitted Drive folder (only populated once
// checkStatus = READY). No _id, these are display-only, never referenced.
// `driveId` is the Drive file id, which the AI grader reads the file by.
const submissionFileSchema = new mongoose.Schema(
  {
    driveId: { type: String, default: '' },
    name: { type: String, required: true },
    type: { type: String, enum: ['doc', 'slides', 'html', 'video', 'image', 'other'], default: 'other' },
    webViewLink: { type: String, default: '' },
    mimeType: { type: String, default: '' },
  },
  { _id: false },
);

// A student's submission for one assignment/project, plus the admin's grade.
//
// Three independent layers live on this one document, kept in separate field
// groups so each can evolve without touching the others:
//   1. Drive folder verification (checkStatus/errorDetail/files/checkedAt),
//      automated structural check, see utils/driveVerify.js.
//   2. The grade (status/score/feedback): what the student sees. Set by the
//      AI review below, or by an admin overriding it (gradedBy says which).
//   3. AI review (aiReview): Gemini reads the folder and scores it against
//      the assignment's rubric (config/rubrics.js, utils/aiGrader.js). Its
//      result is copied into #2, and kept here with the per-criterion
//      breakdown and the run's bookkeeping.
const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, default: '' },
    driveLink: { type: String, default: '' },
    text: { type: String, default: '' },
    score: { type: Number, default: null },
    feedback: { type: String, default: '' },
    status: { type: String, enum: ['submitted', 'graded'], default: 'submitted', index: true },
    // Who set the grade above. An admin's grade is final: the AI never
    // overwrites it, and it locks the submission.
    gradedBy: { type: String, enum: ['ai', 'admin', null], default: null },

    // Drive folder verification (see utils/driveVerify.js). Null until a
    // driveLink submission has been checked at least once.
    checkStatus: { type: String, enum: ['PENDING_CHECK', 'READY', 'NEEDS_FIXES', 'CHECK_FAILED', null], default: null, index: true },
    errorDetail: { type: String, default: null },
    files: { type: [submissionFileSchema], default: [] },
    checkedAt: { type: Date, default: null },

    // Set once an admin grades the submission; blocks further student edits
    // until an admin explicitly unlocks it (POST /:id/unlock). An AI grade
    // does not lock: the student can improve the work and resubmit.
    locked: { type: Boolean, default: false },

    // AI review. Null until a READY folder is queued for review.
    //   pending: queued or running   done: graded   failed: will be retried
    // `attempts` counts failed runs for this version of the folder; the
    // sweep in utils/aiGrader.js gives up after a few.
    aiReview: {
      type: new mongoose.Schema({
        status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
        score: { type: Number, default: null },
        rubric: { type: String, default: '' },
        criteria: {
          type: [new mongoose.Schema({
            id: String, name: String, max: Number, score: Number, note: String,
          }, { _id: false })],
          default: [],
        },
        feedback: { type: String, default: '' },
        // What the grader could and couldn't open, so a low score can be
        // traced to an unreadable file rather than to the work.
        files: {
          type: [new mongoose.Schema({ name: String, read: String }, { _id: false })],
          default: [],
        },
        model: { type: String, default: '' },
        error: { type: String, default: '' },
        attempts: { type: Number, default: 0 },
        queuedAt: { type: Date, default: null },
        reviewedAt: { type: Date, default: null },
      }, { _id: false }),
      default: null,
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// One submission per student per assignment (re-submitting updates it).
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

// "My submissions, for these assignments" -- /assignments?scope=mine on every
// student home and Learning load, and the admin student overview. The unique
// index above is the wrong way round for it: that one is keyed by assignment,
// this one by the student asking.
submissionSchema.index({ studentId: 1, isDeleted: 1, assignmentId: 1 });

// The AI grader's sweep: folders that passed the check and still await a grade.
submissionSchema.index({ status: 1, checkStatus: 1, 'aiReview.status': 1 });

export const Submission = mongoose.model('Submission', submissionSchema, 'skeo_submissions');

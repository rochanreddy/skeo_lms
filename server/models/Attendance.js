import mongoose from 'mongoose';

// One record per (session, student). Admins mark it; students see their %.
const attendanceSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['present', 'absent'], default: 'absent' },
  },
  { timestamps: true },
);

// One attendance row per student per session.
attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema, 'skeo_attendance');

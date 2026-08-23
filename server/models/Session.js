import mongoose from 'mongoose';

// A scheduled class within a batch. Powers the student Home "upcoming class",
// the calendar, and attendance (each attendance record points at a session).
const sessionSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    title: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    joinUrl: { type: String, default: '' },
    zoomMeetingId: { type: String, default: '', index: true }, // matches Zoom webhook events → attendance
    recordingUrl: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Session = mongoose.model('Session', sessionSchema, 'skeo_sessions');

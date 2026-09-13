import mongoose from 'mongoose';

// A per-user in-app notification (graded work, new quiz/assignment, announcement,
// doubt reply, support request). Shown under the bell in the top bar.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, default: 'info' }, // grade | quiz | assignment | announcement | doubt | support | info
    text: { type: String, required: true },
    link: { type: String, default: '' }, // in-app route, e.g. /app/learning
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// The bell reads exactly one shape: this user's notifications, newest first,
// capped at 30. On userId alone Mongo had to fetch every notification the user
// had ever received and sort them in memory; this serves the sort from the
// index and stops at 30.
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema, 'skeo_notifications');

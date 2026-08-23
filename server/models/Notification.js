import mongoose from 'mongoose';

// A per-user in-app notification (graded work, new quiz/assignment, announcement,
// doubt reply). Shown under the bell in the top bar.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, default: 'info' }, // grade | quiz | assignment | announcement | doubt | info
    text: { type: String, required: true },
    link: { type: String, default: '' }, // in-app route, e.g. /app/learning
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export const Notification = mongoose.model('Notification', notificationSchema, 'skeo_notifications');

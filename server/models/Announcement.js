import mongoose from 'mongoose';

// A broadcast an admin posts to a batch. Students see it on their
// dashboard and get a notification.
const announcementSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Announcement = mongoose.model('Announcement', announcementSchema, 'skeo_announcements');

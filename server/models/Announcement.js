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

// Both reads are "these batches, newest first, capped at 50" — one batch, or
// the $in set of every batch the caller belongs to. Sorting from the index
// keeps that off the in-memory sort path as the archive grows.
announcementSchema.index({ batchId: 1, createdAt: -1 });

export const Announcement = mongoose.model('Announcement', announcementSchema, 'skeo_announcements');

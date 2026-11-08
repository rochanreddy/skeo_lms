import mongoose from 'mongoose';
import { keepsClassCacheFresh } from '../utils/classCache.js';

// A broadcast an admin posts. With a batchId it goes to that cohort; with
// none it is an update from Menler to every student. Students see it in the
// Updates card on their home screen and get a notification.
const announcementSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    // Optional: where the update points, a Menler page, an event, a form.
    link: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

// Both reads are "these batches, newest first, capped at 50", one batch, or
// the $in set of every batch the caller belongs to. Sorting from the index
// keeps that off the in-memory sort path as the archive grows.
announcementSchema.index({ batchId: 1, createdAt: -1 });

keepsClassCacheFresh(announcementSchema);

export const Announcement = mongoose.model('Announcement', announcementSchema, 'skeo_announcements');

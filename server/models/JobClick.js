import mongoose from 'mongoose';

// A student opened a job listing from the board (the title or Apply). One row
// per student per job: opening the same listing twice is still one job, which
// is what the "Jobs opened" figure on the student home counts.
//
// jobId is a string because listings come from two places, hand-posted
// openings here and scraped ones in the jobs database, and the ids of the
// latter mean nothing in this one. Title and company are copied in so the
// record still reads once a scraped listing has dropped off the feed.
const jobClickSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: String, required: true },
    title: { type: String, default: '' },
    company: { type: String, default: '' },
  },
  { timestamps: true },
);

jobClickSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const JobClick = mongoose.model('JobClick', jobClickSchema, 'skeo_job_clicks');

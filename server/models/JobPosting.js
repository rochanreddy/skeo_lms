import mongoose from 'mongoose';

// A job/internship opening. Admins post it; everyone can browse and apply
// via the external link.
const jobPostingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, default: '' },
    type: { type: String, enum: ['Full-time', 'Part-time', 'Internship', 'Contract'], default: 'Full-time' },
    description: { type: String, default: '' },
    applyUrl: { type: String, default: '' },
  },
  { timestamps: true },
);

export const JobPosting = mongoose.model('JobPosting', jobPostingSchema, 'skeo_job_postings');

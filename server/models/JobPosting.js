import mongoose from 'mongoose';
import {
  ROLE_CATEGORY_VALUES,
  WORK_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
} from '../lib/jobTaxonomy.js';

/**
 * An opening posted by hand by an admin.
 *
 * The board is mostly fed by skeo-job-pipeline, which scrapes ten sources
 * every morning. This is the other half: the roles that never reach a job
 * board — a partner company's opening, something that came in by email —
 * which an admin types in and which sit alongside the scraped ones.
 *
 * WHY THESE STAY IN SKEO'S OWN DATABASE. The obvious thing would be to write
 * them into the pipeline's collection so there is one list. We can't: this
 * service holds a read-only credential for that cluster, deliberately, so a
 * bug here cannot damage a feed other products read. Instead both are read
 * and merged at request time, and the fields below are named to match the
 * pipeline's schema exactly so the merge needs no translation.
 *
 * `type` used to be a four-value enum (Full-time / Part-time / Internship /
 * Contract). It is gone, replaced by `workType`, which can also express
 * freelance and "not specified" — see normalizeWorkType for the fold. Rows
 * written before that still parse: the route reads the old field when the
 * new one is missing.
 */
const jobPostingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, default: '' },
    country: { type: String, default: null },
    isRemote: { type: Boolean, default: false },

    // Called applyUrl rather than url because for a hand-posted opening it is
    // where a student applies, which is not always where it was advertised.
    applyUrl: { type: String, default: '' },
    description: { type: String, default: '' },

    roleCategory: { type: String, default: null, enum: [...ROLE_CATEGORY_VALUES, null] },
    workType: { type: String, default: 'unspecified', enum: WORK_TYPE_VALUES },
    experienceLevel: {
      type: String,
      default: 'unspecified',
      enum: EXPERIENCE_LEVEL_VALUES,
    },

    // When the role was actually opened, which is not always when it was
    // typed in. The board's rolling window is measured from this.
    postedAt: { type: Date, default: Date.now },

    // Who added it, for the admin list. Not shown to students.
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // The old four-value enum, kept only so rows written before the taxonomy
    // change still read. Nothing writes it any more.
    type: { type: String, default: null },
  },
  { timestamps: true },
);

// The board lists newest first and filters by category, same as the scraped
// half. Tiny collection, but the sort is on every request.
jobPostingSchema.index({ postedAt: -1 });

export const JobPosting = mongoose.model('JobPosting', jobPostingSchema, 'skeo_job_postings');

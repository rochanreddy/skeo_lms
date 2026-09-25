import mongoose from 'mongoose';
import { jobsDb } from '../db.js';

/**
 * A job scraped by skeo-job-pipeline.
 *
 * READ ONLY. This service never writes here — the pipeline owns the data, on
 * its own cluster, reached with a read-only Atlas user. The schema is
 * `strict: false` because the pipeline can add a field without this model
 * knowing, and a stricter definition would silently drop it on read.
 *
 * The model is built lazily on first use rather than at import time, because
 * the connection only exists when JOBS_MONGODB_URI is set, and the LMS has to
 * start and serve every other route when it isn't.
 */

const scrapedJobSchema = new mongoose.Schema(
  {
    title: String,
    company: String,
    location: String,
    country: String,
    isRemote: Boolean,
    url: String,
    source: String,
    companyLogo: String,
    sources: [String],
    roleCategory: String,
    workType: String,
    experienceLevel: String,
    // How well the posting matches the Menler syllabus, and which of its
    // terms it matched. Scored by the pipeline (pipeline/syllabus.js), never
    // here.
    relevance: Number,
    matchedSkills: [String],

    // Reachability, scored by the pipeline's pipeline/ranking.js: can the
    // student get it, is it open to them in India, can they apply today.
    // rankScore weights those three with relevance and is what this board
    // sorts on.
    //
    // Declared despite strict:false because these are load-bearing for this
    // route rather than fields that happen to ride along: the board's whole
    // order depends on rankScore, and rankReasons is what explains it on the
    // card.
    achievability: Number,
    indiaFit: Number,
    easeOfApply: Number,
    rankScore: Number,
    rankReasons: [String],
    postedAt: Date,
    fetchedAt: Date,
    lastSeenAt: Date,
    isActive: Boolean,
  },
  { strict: false, collection: 'jobs' },
);

let model = null;

/** Returns the model, or null when no jobs database is configured. */
export function ScrapedJob() {
  const connection = jobsDb();
  if (!connection) return null;

  if (!model) model = connection.model('ScrapedJob', scrapedJobSchema);
  return model;
}

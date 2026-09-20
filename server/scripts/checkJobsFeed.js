/**
 * Reads the jobs feed the way the board does, and prints what comes back.
 *
 * A connectivity and sanity check, not a test: it exercises the real filters
 * from routes/jobs.js against the real cluster, so "the board is empty" can
 * be told apart from "the credential is wrong" without starting the API.
 *
 *   node scripts/checkJobsFeed.js
 */

import 'dotenv/config';
import { jobsDbConfigured } from '../db.js';
import { ScrapedJob } from '../models/ScrapedJob.js';
import { parseFilters, scrapedFilter, FRESH_DAYS } from '../routes/jobs.js';

const count = async (Model, query) => Model.countDocuments(scrapedFilter(parseFilters(query)));

async function main() {
  if (!jobsDbConfigured()) {
    console.log('JOBS_MONGODB_URI is not set — the board would show only hand-posted openings.');
    return;
  }

  const Scraped = ScrapedJob();

  const onBoard = await count(Scraped, {});
  const everything = await Scraped.countDocuments({});

  console.log(`window          : ${FRESH_DAYS} days`);
  console.log(`stored in total : ${everything}`);
  console.log(`on the board    : ${onBoard}`);
  console.log('');

  const checks = [
    ['India', { place: 'India' }],
    ['Remote', { place: 'Remote' }],
    ['AI-Tech', { category: 'AI-Tech' }],
    ['Business', { category: 'Business' }],
    ['Creative + Writing', { category: 'Creative,Writing' }],
    ['internships', { workType: 'internship' }],
    ['entry level', { experience: 'entry' }],
    ['search "engineer"', { search: 'engineer' }],
    ['bogus category', { category: 'Nonsense' }],
    ['operator injection', { workType: { $ne: 'x' } }],
  ];

  for (const [label, query] of checks) {
    const n = await count(Scraped, query);
    console.log(`  ${label.padEnd(20)} ${String(n).padStart(6)}`);
  }

  console.log('');
  const sample = await Scraped.find(scrapedFilter(parseFilters({ category: 'AI-Tech', place: 'India' })))
    .sort({ postedAt: -1 })
    .limit(3)
    .lean();

  console.log('newest AI-Tech in India:');
  for (const job of sample) {
    console.log(`  ${job.title} — ${job.company} (${job.location || job.country}) [${job.source}]`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Feed check failed:', err.message);
    process.exit(1);
  });

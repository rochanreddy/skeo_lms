import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { JobPosting } from '../models/JobPosting.js';
import { ScrapedJob } from '../models/ScrapedJob.js';
import { jobsDbConfigured } from '../db.js';
import {
  ROLE_CATEGORIES,
  DOMAINS,
  CATEGORY_TO_DOMAIN,
  WORK_TYPES,
  EXPERIENCE_LEVELS,
  isRoleCategory,
  isDomain,
  isWorkType,
  isExperienceLevel,
  normalizeWorkType,
} from '../lib/jobTaxonomy.js';

const router = Router();

/**
 * The job board, for students and admins alike.
 *
 * It has two halves and shows them as one list:
 *
 *   scraped   ten sources, refreshed every morning by skeo-job-pipeline,
 *             read straight through with no approval step. Nobody vets
 *             these; the classifier decides what is relevant and the board
 *             shows what it kept.
 *   manual    openings an admin typed in, held in this LMS's own database
 *             because our credential for the pipeline's cluster is
 *             read-only on purpose.
 *
 * Students and admins see exactly the same listings. The only thing the
 * admin has that a student doesn't is the ability to add one and remove one
 * they added — there is no separate admin view to drift out of step.
 */

/**
 * The rolling window: a job shows for its first FRESH_DAYS days and then
 * falls off the back, so today's arrivals push out the oldest day's.
 *
 * Applied when the board reads rather than written into a flag overnight, so
 * it is exact to the second and changing it takes effect immediately.
 * Mirrors FRESH_DAYS in the pipeline's db/readJobs.js — change both.
 */
export const FRESH_DAYS = 10;

const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps only the values the taxonomy knows.
 *
 * These arrive off a query string, where `?workType[$ne]=x` arrives as an
 * object and would hand Mongo an operator instead of a value. Whitelisting
 * closes that, and means a typo narrows nothing rather than silently
 * returning an empty board.
 */
function clean(input, isValid) {
  const raw = Array.isArray(input) ? input : [input];
  const flat = raw
    .filter((v) => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(flat.filter(isValid))];
}

function cleanText(input, max = 120) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, max);
}

/** Parses the filters both halves are queried with. Exported for tests. */
export function parseFilters(query) {
  const page = Number.parseInt(query.page, 10);
  const places = clean(query.place, (v) =>
    ['India', 'International', 'Remote'].includes(v),
  );

  return {
    categories: clean(query.category, isRoleCategory),
    domains: clean(query.domain, isDomain),
    workTypes: clean(query.workType, isWorkType),
    levels: clean(query.experience, isExperienceLevel),
    places,
    search: cleanText(query.search),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Everything posted within the window, by the date the role opened. */
function freshSince() {
  return new Date(Date.now() - FRESH_DAYS * DAY_MS);
}

export function scrapedFilter(f) {
  const and = [
    {
      $or: [
        { postedAt: { $gte: freshSince() } },
        // The handful of listings whose source gave no date fall back to
        // when we first saw them. It is ~0.1% of rows, not the usual path.
        { postedAt: null, fetchedAt: { $gte: freshSince() } },
      ],
    },
  ];

  // isActive false means the employer withdrew it, which is the pipeline's
  // one judgement. Age is this window's business, not that flag's.
  const filter = { isActive: { $ne: false }, $and: and };

  if (f.categories.length) filter.roleCategory = { $in: f.categories };
  // Every scraped row carries a domain - the pipeline files new jobs as it
  // writes them and backfillDomain.js filed the rest - so this is a plain
  // match with no fallback.
  if (f.domains.length) filter.domain = { $in: f.domains };
  if (f.workTypes.length) filter.workType = { $in: f.workTypes };
  if (f.levels.length) filter.experienceLevel = { $in: f.levels };

  const places = placeClause(f.places);
  if (places) and.push(places);

  if (f.search) filter.$text = { $search: f.search };

  return filter;
}

/** "India", "International", "Remote" as one $or, or null when none are on. */
function placeClause(places) {
  const or = [];
  if (places.includes('India')) or.push({ country: 'India' });
  if (places.includes('International')) or.push({ country: { $ne: 'India' } });
  if (places.includes('Remote')) or.push({ isRemote: true });
  return or.length ? { $or: or } : null;
}

/**
 * Which categories file into these domains. Used to reach hand-posted
 * openings written before domains existed, which carry only a category.
 */
function categoriesFor(domains) {
  return Object.entries(CATEGORY_TO_DOMAIN)
    .filter(([, domain]) => domains.includes(domain))
    .map(([category]) => category);
}

export function manualFilter(f) {
  const filter = { postedAt: { $gte: freshSince() } };
  // Place, domain and search are each an $or. Assigned to filter.$or in turn,
  // each would silently replace the one before - the same bug the pipeline's
  // dashboard once had - so every one of them goes under a single $and.
  const and = [];

  if (f.categories.length) filter.roleCategory = { $in: f.categories };
  if (f.workTypes.length) filter.workType = { $in: f.workTypes };
  if (f.levels.length) filter.experienceLevel = { $in: f.levels };

  // Openings posted before domains existed carry only a category, so they are
  // matched through it rather than dropping out of every domain filter.
  if (f.domains.length) {
    and.push({
      $or: [
        { domain: { $in: f.domains } },
        { domain: null, roleCategory: { $in: categoriesFor(f.domains) } },
      ],
    });
  }

  const places = placeClause(f.places);
  if (places) and.push(places);

  // No text index on this collection — it holds dozens of rows, not
  // thousands, so a regex over two fields is cheaper than the index would be.
  if (f.search) {
    const safe = f.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    and.push({ $or: [{ title: rx }, { company: rx }] });
  }

  if (and.length) filter.$and = and;
  return filter;
}

/** True for an absolute http(s) URL, which is the only kind a card links to. */
export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** One shape for the client, whichever half a listing came from. */
const shapeScraped = (job) => ({
  id: String(job._id),
  title: job.title,
  company: job.company,
  location: job.location,
  country: job.country,
  isRemote: Boolean(job.isRemote),
  url: job.url,
  source: job.source,
  companyLogo: job.companyLogo || null,
  roleCategory: job.roleCategory,
  domain: job.domain || CATEGORY_TO_DOMAIN[job.roleCategory] || null,
  workType: job.workType || 'unspecified',
  experienceLevel: job.experienceLevel || 'unspecified',
  // Which syllabus terms put this listing where it is — "claude", "n8n",
  // "prompt engineering". The pipeline scores relevance from these, so
  // showing them is the difference between an order a student trusts and one
  // that looks arbitrary.
  matchedSkills: Array.isArray(job.matchedSkills) ? job.matchedSkills : [],
  // Why this listing sits where it does: ["internship", "Bengaluru",
  // "direct apply", "matches claude"].
  rankReasons: Array.isArray(job.rankReasons) ? job.rankReasons : [],
  postedAt: job.postedAt,
  description: '',
  origin: 'feed',
});

const shapeManual = (job) => ({
  id: String(job._id),
  title: job.title,
  company: job.company,
  location: job.location,
  country: job.country,
  isRemote: Boolean(job.isRemote),
  url: job.applyUrl,
  source: 'manual',
  companyLogo: null,
  roleCategory: job.roleCategory,
  // Openings posted before domains existed carry only a category.
  domain: job.domain || CATEGORY_TO_DOMAIN[job.roleCategory] || null,
  // Rows written before the taxonomy change still carry the old enum.
  workType: job.workType || normalizeWorkType(job.type),
  experienceLevel: job.experienceLevel || 'unspecified',
  // Hand-posted openings are never scored, so they carry no matched terms.
  matchedSkills: [],
  // Hand-posted openings are never scored, so they carry no reasons either.
  rankReasons: [],
  postedAt: job.postedAt || job.createdAt,
  description: job.description || '',
  origin: 'manual',
});

// GET /api/skeo/jobs — the board. Same list for every role.
router.get('/', requireAuth, async (req, res) => {
  const filters = parseFilters(req.query);
  const Scraped = ScrapedJob();

  // The team's own postings lead. There are a handful of them against
  // thousands of scraped rows, and they are the ones somebody chose to put
  // in front of these particular students — so they head page one rather
  // than being lost by date among the feed. They still age out with
  // everything else.
  const manualRows =
    filters.page === 1
      ? await JobPosting.find(manualFilter(filters)).sort({ postedAt: -1 }).limit(50).lean()
      : [];

  const manual = manualRows.map(shapeManual);

  if (!Scraped) {
    // No feed configured: the board is still the admin's own postings rather
    // than an error page.
    return res.json({
      jobs: manual,
      total: manual.length,
      page: 1,
      pages: 1,
      feedAvailable: false,
      facets: { domains: DOMAINS, categories: ROLE_CATEGORIES, workTypes: WORK_TYPES, levels: EXPERIENCE_LEVELS },
    });
  }

  const filter = scrapedFilter(filters);
  // Best overall match first, newest breaking ties. The pipeline scores
  // `rankScore` once when it stores a job, so this costs nothing here.
  //
  // It combines four things in priority order: can the student get it
  // (experience level, title seniority, years demanded), is it open to them
  // in India, can they apply today, and does it match the syllabus. The
  // weights live in the pipeline's pipeline/ranking.js.
  //
  // This used to sort on `relevance` alone, which answered the wrong
  // question: a Staff Engineer role in San Francisco wanting ten years and a
  // US work visa matches the syllabus perfectly and is no use to anybody
  // here. Mirrors buildJobSort() in the pipeline's db/readJobs.js — change
  // both.
  //
  // A search term overrides it: the reader has said what they want, and
  // ranking anything above their own query would be the board arguing with
  // them.
  const sort = filters.search
    ? { score: { $meta: 'textScore' }, postedAt: -1 }
    : { rankScore: -1, postedAt: -1 };
  const projection = filters.search ? { score: { $meta: 'textScore' } } : {};

  // Page one is shortened by however many manual postings sit above it, so
  // every page holds the same number of cards.
  const take = Math.max(PAGE_SIZE - manual.length, 5);
  const skip = filters.page === 1 ? 0 : (filters.page - 1) * PAGE_SIZE - manual.length;

  let scraped = [];
  let total = 0;
  let feedAvailable = true;

  try {
    [scraped, total] = await Promise.all([
      Scraped.find(filter, projection).sort(sort).skip(Math.max(skip, 0)).limit(take).lean(),
      Scraped.countDocuments(filter),
    ]);
  } catch (err) {
    // The feed lives on another cluster. If it is unreachable the board
    // should still show what this LMS holds, and say why it looks thin.
    console.error('Job feed unavailable:', err.message);
    feedAvailable = false;
  }

  const jobs = [...manual, ...scraped.map(shapeScraped)];

  res.json({
    jobs,
    total: total + manual.length,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    feedAvailable,
    facets: { domains: DOMAINS, categories: ROLE_CATEGORIES, workTypes: WORK_TYPES, levels: EXPERIENCE_LEVELS },
  });
});

// POST /api/skeo/jobs — an admin adds an opening by hand.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const {
    title,
    company,
    location,
    applyUrl,
    description,
    roleCategory,
    domain,
    workType,
    experienceLevel,
    isRemote,
    country,
  } = req.body || {};

  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!company || !String(company).trim()) return res.status(400).json({ error: 'Company is required.' });

  // This becomes the href on the card's Apply button, so a javascript: or
  // data: value would be a script a student clicks. Only http(s) goes in.
  const link = typeof applyUrl === 'string' ? applyUrl.trim() : '';
  if (link && !isHttpUrl(link)) {
    return res.status(400).json({ error: 'The apply link has to start with http:// or https://.' });
  }

  const job = await JobPosting.create({
    title: String(title).trim(),
    company: String(company).trim(),
    location: location || '',
    country: country || null,
    isRemote: Boolean(isRemote),
    applyUrl: link,
    description: description || '',
    roleCategory: isRoleCategory(roleCategory) ? roleCategory : null,
    domain: isDomain(domain) ? domain : null,
    workType: isWorkType(workType) ? workType : normalizeWorkType(workType),
    experienceLevel: isExperienceLevel(experienceLevel) ? experienceLevel : 'unspecified',
    postedAt: new Date(),
    postedBy: req.user?._id || null,
  });

  res.status(201).json({ job: shapeManual(job.toObject()) });
});

// DELETE /api/skeo/jobs/:id — removes a hand-posted opening.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const removed = await JobPosting.findByIdAndDelete(req.params.id);

  // A scraped listing has no id in this database, so a miss almost always
  // means someone tried to delete one. Say so rather than reporting success.
  if (!removed) {
    return res.status(404).json({
      error: 'Not found. Listings from the feed cannot be removed here — they drop off on their own.',
    });
  }

  res.json({ ok: true });
});

export default router;

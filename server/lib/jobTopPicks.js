// The first 1,000 openings on the board: good AND new.
//
// The board's plain order is rankScore, best first. Over a fifteen-day window
// that put two-week-old postings at the very top, because an old job that
// ranks well ranks well forever - and an opening that old has usually had
// its applicants. So the head of the board is chosen differently:
//
//   1. Only jobs posted in the last TOP_DAYS calendar days (India time), and
//      only those with a rankScore of at least TOP_MIN_RANK - the quality
//      floor. Measured on 7 Nov 2026, 200-400 jobs a day clear it.
//   2. Picked best-first on rankScore plus a recency boost, so a strong job
//      from today beats an equal one from five days ago. The same opening
//      from two sources is kept once, and one employer at most PER_COMPANY
//      times, so a single recruiting push cannot fill the top.
//   3. Shown newest day first - today, yesterday, two days ago - and within a
//      day the domains interleaved, so each day reads as a cross-section
//      rather than forty AI roles and then forty sales ones.
//
// Everything after the first 1,000 is the rest of the window in plain
// rankScore order (routes/jobs.js). These are pure functions so the rules
// can be tested without a database (tests/jobTopPicks.test.js).

/** How many openings the curated head of the board holds. */
export const TOP_SIZE = 1000;

/** Today and the TOP_DAYS calendar days before it. */
export const TOP_DAYS = 5;

/** The quality floor: the pipeline's rankScore, 0-100. */
export const TOP_MIN_RANK = 45;

/** One employer at most this many times in the head of the board. */
export const PER_COMPANY = 5;

/** Recency points by days old: today, yesterday, ... TOP_DAYS. */
export const RECENCY_BOOST = [12, 10, 8, 6, 4, 2];

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDay = (t) => Math.floor((t + IST_OFFSET_MS) / DAY_MS);

const postedTime = (job) => new Date(job.postedAt || job.fetchedAt || 0).getTime();

/**
 * Calendar days since a job was posted, in India time. Null when it has no
 * date, or a date in the future - a source's bad date, which would otherwise
 * sit at the top of any newest-first order.
 */
export function daysOld(job, now = Date.now()) {
  const at = postedTime(job);
  if (!at) return null;
  const days = istDay(now) - istDay(at);
  return days < 0 ? null : days;
}

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const named = (company) => {
  const name = squash(company);
  return name && !/^(null|undefined|n a|na|confidential)$/.test(name) ? name : '';
};

/**
 * Picks and orders the head of the board.
 *
 * @param {object[]} candidates  scraped rows, already inside the board's filters
 * @returns {object[]} at most `size` rows, each with `day` (0 = today)
 */
export function pickTop(candidates, { size = TOP_SIZE, now = Date.now(), perCompany = PER_COMPANY } = {}) {
  const eligible = [];
  for (const job of candidates) {
    const day = daysOld(job, now);
    if (day === null || day > TOP_DAYS) continue;
    if (!(job.rankScore >= TOP_MIN_RANK)) continue;
    eligible.push({ job, day, score: job.rankScore + RECENCY_BOOST[day] });
  }
  eligible.sort((a, b) => b.score - a.score || postedTime(b.job) - postedTime(a.job));

  const seen = new Set();
  const perEmployer = new Map();
  const picked = [];
  for (const item of eligible) {
    if (picked.length >= size) break;
    const key = `${squash(item.job.title)}|${named(item.job.company)}`;
    if (seen.has(key)) continue;
    // Unnamed employers share one bucket rather than each being a free pass.
    const employer = named(item.job.company) || '(unnamed)';
    const used = perEmployer.get(employer) || 0;
    if (used >= perCompany) continue;
    seen.add(key);
    perEmployer.set(employer, used + 1);
    picked.push(item);
  }

  // Newest day first; inside a day, each domain's jobs best-first and the
  // domains interleaved by relative depth, so the first rows of a day hold
  // the top few of every domain in proportion.
  const byDay = new Map();
  for (const item of picked) {
    if (!byDay.has(item.day)) byDay.set(item.day, new Map());
    const domains = byDay.get(item.day);
    const domain = item.job.domain || 'other';
    if (!domains.has(domain)) domains.set(domain, []);
    domains.get(domain).push(item);
  }

  const ordered = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const placed = [];
    for (const list of byDay.get(day).values()) {
      list.sort((a, b) => b.score - a.score);
      list.forEach((item, i) => placed.push({ item, at: (i + 0.5) / list.length }));
    }
    placed.sort((a, b) => a.at - b.at || b.item.score - a.item.score);
    for (const { item } of placed) ordered.push({ ...item.job, day });
  }
  return ordered;
}

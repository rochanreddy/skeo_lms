/**
 * The vocabularies a scraped job is tagged with.
 *
 * A copy of `pipeline/taxonomy.js` in skeo-job-pipeline, which is the source
 * of truth — its classifiers produce these values. When a category is added
 * or renamed it changes there first, then here. Kept as a plain copy rather
 * than a shared package because the two repos deploy separately and a
 * published package for four lists would cost more than it saves.
 *
 * Stored values are slugs, never labels: labels change when someone dislikes
 * the wording, and rewriting thousands of rows over a copy edit should not be
 * possible.
 */

/** Order is the order the board offers them in. */
export const ROLE_CATEGORIES = [
  { value: 'AI-Tech', label: 'AI — Technical' },
  { value: 'AI-NonTech', label: 'AI — Non-technical' },
  { value: 'Tech', label: 'Tech' },
  { value: 'Creative', label: 'Creative' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Writing', label: 'Writing' },
  { value: 'Business', label: 'Business' },
];

/**
 * How the work is engaged — independent of category, because a freelance gig
 * can be technical or not and so can a staff job. `unspecified` is a real
 * answer: most boards never say, and defaulting to full-time because it is
 * the common case would put wrong information on a listing.
 */
export const WORK_TYPES = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'internship', label: 'Internship' },
  { value: 'unspecified', label: 'Not specified' },
];

export const EXPERIENCE_LEVELS = [
  { value: 'internship', label: 'Internship' },
  { value: 'entry', label: 'Entry level' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'unspecified', label: 'Not specified' },
];

export const ROLE_CATEGORY_VALUES = ROLE_CATEGORIES.map((c) => c.value);
export const WORK_TYPE_VALUES = WORK_TYPES.map((w) => w.value);
export const EXPERIENCE_LEVEL_VALUES = EXPERIENCE_LEVELS.map((e) => e.value);

/**
 * Other people's spellings for the same thing.
 *
 * The capitalised four are the old `JobPosting.type` enum this board used
 * before it read the pipeline, so an opening posted by hand back then still
 * lands somewhere sensible.
 */
const WORK_TYPE_ALIASES = {
  'full-time': 'full-time',
  fulltime: 'full-time',
  permanent: 'full-time',
  'part-time': 'part-time',
  parttime: 'part-time',
  contract: 'contract',
  contractor: 'contract',
  temporary: 'contract',
  freelance: 'freelance',
  gig: 'freelance',
  internship: 'internship',
  intern: 'internship',
  trainee: 'internship',
};

/**
 * Folds any of the spellings above onto a canonical work type. Anything
 * unrecognised becomes `unspecified`, which is more honest than picking the
 * nearest-looking value and being confidently wrong.
 */
export function normalizeWorkType(input) {
  if (typeof input !== 'string') return 'unspecified';

  const key = input.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return WORK_TYPE_ALIASES[key] || 'unspecified';
}

export const isRoleCategory = (v) => ROLE_CATEGORY_VALUES.includes(v);
export const isWorkType = (v) => WORK_TYPE_VALUES.includes(v);
export const isExperienceLevel = (v) => EXPERIENCE_LEVEL_VALUES.includes(v);

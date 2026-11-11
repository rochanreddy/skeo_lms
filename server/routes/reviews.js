import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Review } from '../models/Review.js';
import { REVIEW_QUESTIONS, REVIEW_LINKS, REVIEW_INTRO } from '../config/reviews.js';

const router = Router();

// Only reviews that answered today's questions count. Ones left on an earlier
// form (the old class-session questions) answer none of the current required
// ones, so they are left out everywhere: the admin list, and a student's own
// page, where they get the current form instead.
const CURRENT = { 'answers.questionId': { $all: REVIEW_QUESTIONS.filter((q) => q.required).map((q) => q.id) } };

// GET /api/skeo/reviews/form: the questions, the public review links, and
// the caller's own review if they have left one.
router.get('/form', requireAuth, async (req, res) => {
  const mine = await Review.findOne({ userId: req.user._id, ...CURRENT }).lean();
  res.json({ intro: REVIEW_INTRO, questions: REVIEW_QUESTIONS, links: REVIEW_LINKS, mine });
});

// Check one answer against its question. Returns the clean value, null for
// "not answered", or throws a message for something that can't be right.
function clean(q, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (q.type === 'rating' || q.type === 'scale') {
    const n = Number(raw);
    const [lo, hi] = q.type === 'rating' ? [1, 5] : [0, 10];
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`"${q.label}" needs a number from ${lo} to ${hi}.`);
    return n;
  }
  const s = String(raw).trim().slice(0, q.max || 4000);
  if (!s) return null;
  if (q.type === 'choice' && !(q.options || []).includes(s)) throw new Error(`"${q.label}" has an answer that isn't one of its options.`);
  return s;
}

// POST /api/skeo/reviews { answers: { [questionId]: value } }, students only.
// Once sent, a review is final: it can't be edited. A review left on an
// earlier form is replaced by the new one.
router.post('/', requireAuth, requireRole('student'), async (req, res) => {
  if (await Review.exists({ userId: req.user._id, ...CURRENT })) {
    return res.status(409).json({ error: 'You have already sent your feedback.' });
  }
  const given = req.body?.answers || {};
  const answers = [];
  try {
    for (const q of REVIEW_QUESTIONS) {
      const value = clean(q, given[q.id]);
      if (value === null && q.required) return res.status(400).json({ error: `Please answer "${q.label}".` });
      if (value !== null) answers.push({ questionId: q.id, question: q.label, type: q.type, value });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const review = await Review.findOneAndUpdate(
    { userId: req.user._id },
    { $set: { answers } },
    { new: true, upsert: true },
  ).lean();
  res.status(201).json({ review, links: REVIEW_LINKS });
});

// GET /api/skeo/reviews: every review, newest first, for the admin panel,
// with the questions so the page can lay out answers and averages.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const reviews = await Review.find(CURRENT)
    .populate('userId', 'fullName email')
    .sort({ updatedAt: -1 })
    .limit(1000)
    .lean();
  res.json({ reviews, questions: REVIEW_QUESTIONS });
});

export default router;

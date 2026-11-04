import { Router } from 'express';
import mongoose from 'mongoose';
import { issueCertificate, qrDataUri, verifyUrl } from '../utils/certificates.js';
import { requireAuth } from '../middleware/auth.js';
import { Progress } from '../models/Progress.js';
import { Batch } from '../models/Batch.js';
import { Program, TOPIC_COUNT } from '../models/Program.js';

const router = Router();

/* The programme, plus its lesson count, without reading the curriculum.
 *
 * Both routes below want a title and a total. Loading `modules` to get the
 * total meant the whole tree -- every chapter, every lesson body -- travelling
 * from Atlas into this process on every Learning and student-home load, so
 * that one integer could be reduced out of it. TOPIC_COUNT (models/Program.js)
 * does that arithmetic in the database; what comes back is the `_id`, `title`
 * and `certCode` issueCertificate needs, plus a number. A few dozen bytes.
 */
async function programWithTotal(programId) {
  // Both callers reject a malformed id before they get here; this is the
  // backstop, because aggregate() would not cast it and would not complain.
  if (!mongoose.isValidObjectId(programId)) return null;
  const [p] = await Program.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(String(programId)) } },
    { $project: { title: 1, certCode: 1, total: TOPIC_COUNT } },
  ]);
  return p || null;
}

const EMPTY = { programId: null, completedTopics: [], total: 0, completed: 0, pct: 0, certificateIssuedAt: null };

/* The programme a student is "on": the one their newest cohort teaches.
 *
 * Here so the caller does not have to make two trips to find out. The student
 * home needs this progress to draw its very first card, but it could not ask
 * for it until /batches had come back and told it which programme to ask
 * about -- so the request went out one full round trip behind the other five,
 * and on a phone in India talking to Singapore that is the slowest card on
 * the screen by a wide margin, every single load.
 *
 * Same rule the client uses when it picks which programme to display (the
 * first batch of /batches, which is sorted newest-first), so the two agree.
 * The answer carries its programId back so the client can confirm that rather
 * than assume it.
 */
async function primaryProgramId(user) {
  const [b] = await Batch.find({ studentIds: user._id })
    .sort({ createdAt: -1 })
    .select('programId')
    .limit(1)
    .lean();
  return b?.programId ? String(b.programId) : null;
}

// GET /api/skeo/progress/me?programId= — the student's completion for one
// program. With no programId, the programme their newest cohort teaches.
router.get('/me', requireAuth, async (req, res) => {
  const programId = req.query.programId || (await primaryProgramId(req.user));
  if (!programId) return res.json(EMPTY);
  // A malformed id is a 404, as it was when findById() raised a CastError for
  // it -- aggregate() will not cast, so the check is explicit now.
  if (!mongoose.isValidObjectId(programId)) return res.status(404).json({ error: 'Not found.' });
  // Both halves are keyed on ids we already hold, so they go out together
  // rather than the progress row waiting behind the programme.
  const [program, p] = await Promise.all([
    programWithTotal(programId),
    Progress.findOne({ studentId: req.user._id, programId }).lean(),
  ]);
  if (!program) return res.json(EMPTY);
  const total = program.total || 0;
  const completedTopics = p?.completedTopics || [];
  const completed = Math.min(completedTopics.length, total);
  res.json({ programId: String(programId), completedTopics, total, completed, pct: total ? Math.round((completed / total) * 100) : 0, certificateIssuedAt: p?.certificateIssuedAt || null });
});

// POST /api/skeo/progress/toggle { programId, topicId } — mark a lesson (in)complete.
//
// One atomic update rather than read-modify-write. The old version loaded the
// document, rewrote the whole completedTopics array in JS and saved it back:
// three round trips for a checkbox, and two students (or two tabs) ticking
// lessons at the same moment could each overwrite the other's array. $addToSet
// and $pull apply the single change server-side, so nothing is lost.
router.post('/toggle', requireAuth, async (req, res) => {
  const { programId, topicId } = req.body || {};
  if (!programId || !topicId) return res.status(400).json({ error: 'programId and topicId are required.' });
  if (!mongoose.isValidObjectId(programId)) return res.status(400).json({ error: 'Invalid programId.' });
  const id = String(topicId);
  const filter = { studentId: req.user._id, programId };

  // Is it on now? One indexed existence check against the unique
  // (studentId, programId) index decides which way the toggle goes.
  const has = await Progress.exists({ ...filter, completedTopics: id });
  const doc = await Progress.findOneAndUpdate(
    filter,
    has ? { $pull: { completedTopics: id } } : { $addToSet: { completedTopics: id } },
    { new: true, upsert: true, projection: { completedTopics: 1 } },
  ).lean();

  res.json({ completedTopics: doc?.completedTopics || [], completed: !has });
});

// GET /api/skeo/progress/certificate?programId= — issues a certificate at 100%.
router.get('/certificate', requireAuth, async (req, res) => {
  const { programId } = req.query;
  if (!mongoose.isValidObjectId(programId)) return res.status(404).json({ error: 'Not found.' });
  const [program, p] = await Promise.all([
    programWithTotal(programId),
    Progress.findOne({ studentId: req.user._id, programId }),
  ]);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  const total = program.total || 0;
  const completed = Math.min(p?.completedTopics?.length || 0, total);
  if (!(total > 0 && completed >= total)) return res.json({ eligible: false, completed, total });
  if (!p.certificateIssuedAt) { p.certificateIssuedAt = new Date(); await p.save(); }

  /* A real certificate row, not a number sliced off this Progress document.
     The old id was `MNLR-` + the last eight characters of p._id: the wrong
     brand, guessable from any other student’s id, and backed by nothing a
     stranger could check. issueCertificate is idempotent, so re-opening the
     modal returns the same code rather than minting a second one. */
  const { cert } = await issueCertificate({ student: req.user, program });

  res.json({
    eligible: true,
    program: cert.programTitle,
    name: cert.studentName,
    issuedAt: cert.issuedAt,
    certId: cert.code,
    revoked: Boolean(cert.revokedAt),
    verifyUrl: verifyUrl(cert.code),
    qr: await qrDataUri(cert.code),
  });
});

export default router;

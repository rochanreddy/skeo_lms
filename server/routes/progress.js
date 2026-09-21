import { Router } from 'express';
import { issueCertificate, qrDataUri, verifyUrl } from '../utils/certificates.js';
import { requireAuth } from '../middleware/auth.js';
import { Progress } from '../models/Progress.js';
import { Program } from '../models/Program.js';

const router = Router();

const totalTopics = (program) =>
  (program.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((c, ch) => c + (ch.topics || []).length, 0), 0);

// GET /api/skeo/progress/me?programId= — the student's completion for one program.
router.get('/me', requireAuth, async (req, res) => {
  const { programId } = req.query;
  if (!programId) return res.json({ completedTopics: [], total: 0, completed: 0, pct: 0, certificateIssuedAt: null });
  const program = await Program.findById(programId).select('modules title');
  const total = program ? totalTopics(program) : 0;
  const p = await Progress.findOne({ studentId: req.user._id, programId });
  const completedTopics = p?.completedTopics || [];
  const completed = Math.min(completedTopics.length, total);
  res.json({ completedTopics, total, completed, pct: total ? Math.round((completed / total) * 100) : 0, certificateIssuedAt: p?.certificateIssuedAt || null });
});

// POST /api/skeo/progress/toggle { programId, topicId } — mark a lesson (in)complete.
router.post('/toggle', requireAuth, async (req, res) => {
  const { programId, topicId } = req.body || {};
  if (!programId || !topicId) return res.status(400).json({ error: 'programId and topicId are required.' });
  let p = await Progress.findOne({ studentId: req.user._id, programId });
  if (!p) p = await Progress.create({ studentId: req.user._id, programId, completedTopics: [] });
  const id = String(topicId);
  const has = p.completedTopics.includes(id);
  p.completedTopics = has ? p.completedTopics.filter((t) => t !== id) : [...p.completedTopics, id];
  await p.save();
  res.json({ completedTopics: p.completedTopics, completed: !has });
});

// GET /api/skeo/progress/certificate?programId= — issues a certificate at 100%.
router.get('/certificate', requireAuth, async (req, res) => {
  const { programId } = req.query;
  const program = await Program.findById(programId).select('modules title');
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  const total = totalTopics(program);
  const p = await Progress.findOne({ studentId: req.user._id, programId });
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

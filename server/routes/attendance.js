import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Attendance } from '../models/Attendance.js';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { canManageBatch, myBatchIds, canAccessBatch } from '../utils/access.js';

const router = Router();

// POST /api/skeo/attendance/join/:sessionId — a student marks themselves present
// by joining the live session (called when they click "Join Zoom"). Only counts
// within the session window so it can't be gamed days early/late.
router.post('/join/:sessionId', requireAuth, async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!(await canAccessBatch(req.user, session.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  if (req.user.role !== 'student') return res.json({ ok: true, marked: false }); // admins don't self-mark
  const now = Date.now();
  const start = new Date(session.startsAt).getTime();
  const end = session.endsAt ? new Date(session.endsAt).getTime() : start + 4 * 60 * 60 * 1000;
  const within = now >= start - 15 * 60 * 1000 && now <= end + 60 * 60 * 1000; // 15 min before → 1 h after end
  if (!within) return res.json({ ok: true, marked: false, reason: 'outside session window' });
  await Attendance.updateOne(
    { sessionId: session._id, studentId: req.user._id },
    { $set: { status: 'present', batchId: session.batchId } },
    { upsert: true },
  );
  res.json({ ok: true, marked: true });
});

// GET /api/skeo/attendance/overview — attendance % per batch the user teaches/owns
// (admin). Powers the "attendance by course" chart on the admin board.
router.get('/overview', requireAuth, async (req, res) => {
  const ids = await myBatchIds(req.user);
  const batches = await Batch.find({ _id: { $in: ids } }).select('name');
  const overview = [];
  for (const b of batches) {
    const rows = await Attendance.find({ batchId: b._id });
    const total = rows.length;
    const present = rows.filter((r) => r.status === 'present').length;
    overview.push({ batchId: b._id, name: b.name, pct: total ? Math.round((present / total) * 100) : 0, total });
  }
  res.json({ overview });
});

// POST /api/skeo/attendance/session/:sessionId  { records: [{ studentId, status }] }
// Admin marks attendance for a session (upserts each record).
router.post('/session/:sessionId', requireAuth, async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });

  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  await Promise.all(records.map((r) =>
    Attendance.updateOne(
      { sessionId: session._id, studentId: r.studentId },
      { $set: { status: r.status === 'present' ? 'present' : 'absent', batchId: session.batchId } },
      { upsert: true },
    ),
  ));
  res.json({ ok: true, marked: records.length });
});

// GET /api/skeo/attendance/session/:sessionId — admin sees who's marked.
router.get('/session/:sessionId', requireAuth, async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const records = await Attendance.find({ sessionId: session._id });
  res.json({ records });
});

// GET /api/skeo/attendance/me — the logged-in student's attendance %.
router.get('/me', requireAuth, async (req, res) => {
  const rows = await Attendance.find({ studentId: req.user._id });
  const total = rows.length;
  const present = rows.filter((r) => r.status === 'present').length;
  res.json({ present, total, pct: total ? Math.round((present / total) * 100) : 0 });
});

export default router;

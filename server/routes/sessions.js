import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Session } from '../models/Session.js';
import { canAccessBatch, canManageBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// Pull a Zoom meeting id out of a join URL (…/j/8451234567?…). Registration
// links don't contain it, so an admin can also enter it manually.
function extractMeetingId(url) {
  const s = String(url || '');
  const m = s.match(/\/j\/(\d{9,12})/) || s.match(/(\d{9,12})/);
  return m ? m[1] : '';
}

// GET /api/skeo/sessions?batchId=..  OR  ?scope=upcoming|past
// - batchId: sessions for one batch (members only)
// - otherwise: sessions across all the user's batches (for Home/calendar)
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const now = new Date();
  if (scope === 'upcoming') filter.startsAt = { $gte: now };
  if (scope === 'past') filter.startsAt = { $lt: now };

  const sessions = await Session.find(filter)
    .populate('batchId', 'name')
    .sort({ startsAt: scope === 'past' ? -1 : 1 });
  res.json({ sessions });
});

// POST /api/skeo/sessions — admin schedules a class.
router.post('/', requireAuth, async (req, res) => {
  const { batchId, title, startsAt, endsAt, joinUrl, zoomMeetingId } = req.body || {};
  if (!batchId || !title || !startsAt) return res.status(400).json({ error: 'batchId, title and startsAt are required.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Only an admin can add sessions.' });
  const meetingId = String(zoomMeetingId || '').trim() || extractMeetingId(joinUrl);
  const session = await Session.create({ batchId, title, startsAt, endsAt: endsAt || null, joinUrl: joinUrl || '', zoomMeetingId: meetingId });
  res.status(201).json({ session });
});

// PATCH /api/skeo/sessions/:id — admin edits (e.g. add recordingUrl).
router.patch('/:id', requireAuth, async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const allowed = (({ title, startsAt, endsAt, joinUrl, recordingUrl, zoomMeetingId }) => ({ title, startsAt, endsAt, joinUrl, recordingUrl, zoomMeetingId }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  if (allowed.joinUrl && allowed.zoomMeetingId === undefined && !session.zoomMeetingId) allowed.zoomMeetingId = extractMeetingId(allowed.joinUrl);
  Object.assign(session, allowed);
  await session.save();
  res.json({ session });
});

export default router;

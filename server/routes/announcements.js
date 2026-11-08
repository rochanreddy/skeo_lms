import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Announcement } from '../models/Announcement.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { canAccessBatch, canManageBatch, myBatchIds } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';
import { sendShared } from '../utils/sharedBody.js';

const router = Router();

// GET /api/skeo/announcements?batchId=..  OR  (no batchId) everything the user
// should see: their batches' announcements plus the updates from Menler that
// went to every student (batchId null). An admin's batch list is every batch,
// so the same query gives them the whole archive.
router.get('/', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  let filter;
  let key;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
    key = batchId;
  } else {
    const ids = await myBatchIds(req.user);
    filter = { $or: [{ batchId: { $in: ids } }, { batchId: null }] };
    key = `${ids.join()}+menler`;
  }
  await sendShared(req, res, `announcements:${key}`, async () => ({
    announcements: await Announcement.find(filter)
      .populate('authorId', 'fullName email role')
      .populate('batchId', 'name')
      .sort({ createdAt: -1 }).limit(50)
      .lean(),
  }));
});

// A link is either a page inside the app ("/app/...") or a real web address.
function cleanLink(raw) {
  const link = String(raw || '').trim();
  if (!link) return '';
  if (link.startsWith('/')) return link;
  try {
    const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// POST /api/skeo/announcements { title, body?, link?, batchId? }, admin broadcast.
// Without a batchId it is an update from Menler and goes to every student
// who isn't blocked from the LMS.
router.post('/', requireAuth, async (req, res) => {
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Only an admin can post here.' });
  const { batchId, title, body } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'A title is required.' });
  const link = cleanLink(req.body?.link);
  if (link === null) return res.status(400).json({ error: 'That link is not a web address.' });

  let audience;
  if (batchId) {
    const batch = await Batch.findById(batchId).select('studentIds').lean();
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });
    audience = batch.studentIds || [];
  } else {
    audience = await User.find({ role: 'student', 'blocked.lms': { $ne: true } }).distinct('_id');
  }

  const ann = await Announcement.create({
    batchId: batchId || null, authorId: req.user._id, title, body: body || '', link,
  });
  notifyMany(audience, { type: 'announcement', text: `📢 ${title}`, link: link.startsWith('/') ? link : '/app' });
  res.status(201).json({ announcement: ann, notified: audience.length });
});

// DELETE /api/skeo/announcements/:id, admin takes an update back down.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Only an admin can remove updates.' });
  const gone = await Announcement.findByIdAndDelete(req.params.id).catch(() => null);
  if (!gone) return res.status(404).json({ error: 'Update not found.' });
  res.json({ ok: true });
});

export default router;

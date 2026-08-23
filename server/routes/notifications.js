import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';

const router = Router();

// GET /api/skeo/notifications — the user's recent notifications + unread count.
router.get('/', requireAuth, async (req, res) => {
  const items = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30);
  const unread = await Notification.countDocuments({ userId: req.user._id, read: false });
  res.json({ items, unread });
});

// POST /api/skeo/notifications/read — mark all as read.
router.post('/read', requireAuth, async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

export default router;

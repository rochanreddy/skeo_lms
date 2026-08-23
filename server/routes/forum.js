import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Message } from '../models/Message.js';
import { Doubt } from '../models/Doubt.js';
import { canAccessBatch } from '../utils/access.js';
import { notify } from '../utils/notify.js';

const router = Router();

const author = (u) => (u ? { id: u._id, name: u.fullName || u.email, role: u.role } : null);

// ── Group chat ──

// GET /api/skeo/forum/chat?batchId=.. — last 200 messages (members only).
router.get('/chat', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  if (!batchId || !(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const rows = await Message.find({ batchId }).populate('authorId', 'fullName email role').sort({ createdAt: 1 }).limit(200);
  res.json({ messages: rows.map((m) => ({ id: m._id, text: m.text, at: m.createdAt, author: author(m.authorId) })) });
});

// POST /api/skeo/forum/chat { batchId, text }
router.post('/chat', requireAuth, async (req, res) => {
  const { batchId, text } = req.body || {};
  if (!batchId || !text?.trim()) return res.status(400).json({ error: 'batchId and text are required.' });
  if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const m = await (await Message.create({ batchId, authorId: req.user._id, text: text.trim() })).populate('authorId', 'fullName email role');
  res.status(201).json({ message: { id: m._id, text: m.text, at: m.createdAt, author: author(m.authorId) } });
});

// ── Doubts board ──

const shapeDoubt = (d, meId) => ({
  id: d._id,
  text: d.text,
  at: d.createdAt,
  author: author(d.authorId),
  likeCount: d.likes.length,
  likedByMe: d.likes.some((x) => x.toString() === meId),
  comments: d.comments.map((c) => ({ id: c._id, text: c.text, at: c.createdAt, author: author(c.authorId) })),
});

// GET /api/skeo/forum/doubts?batchId=..
router.get('/doubts', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  if (!batchId || !(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const rows = await Doubt.find({ batchId })
    .populate('authorId', 'fullName email role')
    .populate('comments.authorId', 'fullName email role')
    .sort({ createdAt: -1 });
  res.json({ doubts: rows.map((d) => shapeDoubt(d, req.user._id.toString())) });
});

// POST /api/skeo/forum/doubts { batchId, text } — only students ask doubts.
router.post('/doubts', requireAuth, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can post doubts. Admins answer them.' });
  const { batchId, text } = req.body || {};
  if (!batchId || !text?.trim()) return res.status(400).json({ error: 'batchId and text are required.' });
  if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  await Doubt.create({ batchId, authorId: req.user._id, text: text.trim() });
  res.status(201).json({ ok: true });
});

// POST /api/skeo/forum/doubts/:id/like — toggle like.
router.post('/doubts/:id/like', requireAuth, async (req, res) => {
  const d = await Doubt.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Doubt not found.' });
  if (!(await canAccessBatch(req.user, d.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const me = req.user._id.toString();
  const liked = d.likes.some((x) => x.toString() === me);
  d.likes = liked ? d.likes.filter((x) => x.toString() !== me) : [...d.likes, req.user._id];
  await d.save();
  res.json({ likeCount: d.likes.length, likedByMe: !liked });
});

// POST /api/skeo/forum/doubts/:id/comments { text }
router.post('/doubts/:id/comments', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required.' });
  const d = await Doubt.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Doubt not found.' });
  if (!(await canAccessBatch(req.user, d.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  d.comments.push({ authorId: req.user._id, text: text.trim() });
  await d.save();
  // Notify the doubt's author (unless they're replying to themselves).
  if (d.authorId.toString() !== req.user._id.toString()) {
    notify(d.authorId, { type: 'doubt', text: `${req.user.fullName || 'Someone'} answered your doubt.`, link: '/app/forum' });
  }
  res.status(201).json({ ok: true });
});

export default router;

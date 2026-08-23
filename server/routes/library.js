import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { LibraryItem } from '../models/LibraryItem.js';

const router = Router();

// GET /api/skeo/library — everyone can browse.
router.get('/', requireAuth, async (_req, res) => {
  res.json({ items: await LibraryItem.find().sort({ createdAt: -1 }) });
});

// POST /api/skeo/library — admin add a resource (by link).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, category, url, description } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const item = await LibraryItem.create({ title, category: category || 'Note', url: url || '', description: description || '' });
  res.status(201).json({ item });
});

// DELETE /api/skeo/library/:id — admin only.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await LibraryItem.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;

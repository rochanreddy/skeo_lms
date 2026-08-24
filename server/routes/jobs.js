import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { JobPosting } from '../models/JobPosting.js';

const router = Router();

// GET /api/skeo/jobs — everyone browses (newest first).
router.get('/', requireAuth, async (_req, res) => {
  res.json({ jobs: await JobPosting.find().sort({ createdAt: -1 }) });
});

// POST /api/skeo/jobs — admin post an opening.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, company, location, type, description, applyUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  if (!company) return res.status(400).json({ error: 'Company is required.' });
  const job = await JobPosting.create({
    title,
    company,
    location: location || '',
    type: type || 'Full-time',
    description: description || '',
    applyUrl: applyUrl || '',
  });
  res.status(201).json({ job });
});

// DELETE /api/skeo/jobs/:id — admin only.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await JobPosting.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;

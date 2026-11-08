import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { LibraryItem } from '../models/LibraryItem.js';
import { ownedPlaybookSets } from '../utils/access.js';
import { playbookFilePath } from '../utils/playbooks.js';

const router = Router();

// GET /api/skeo/library: everyone can browse. Paid playbooks are listed for
// everyone too, so a student can see what is on offer, but carry `locked`
// unless this user bought the set they belong to.
router.get('/', requireAuth, async (req, res) => {
  const [items, owned] = await Promise.all([
    LibraryItem.find().sort({ createdAt: -1 }).lean(),
    ownedPlaybookSets(req.user),
  ]);
  res.json({
    items: items.map((i) => (i.playbookSet ? { ...i, locked: !owned.has(i.playbookSet) } : i)),
  });
});

// GET /api/skeo/library/playbooks/:set/:file, the PDF itself, to a buyer of
// that set only. The files sit on the server (assets/playbooks, the same ones
// the purchase mail attaches), never in the public site, so this is the only
// way in.
router.get('/playbooks/:set/:file', requireAuth, async (req, res) => {
  const { set, file } = req.params;
  const filePath = await playbookFilePath(set, file);
  if (!filePath) return res.status(404).json({ error: 'No such playbook.' });
  if (!(await ownedPlaybookSets(req.user)).has(set)) {
    return res.status(403).json({ error: 'This playbook comes with a paid plan.', code: 'not_purchased' });
  }
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', 'inline');
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'No such playbook.' });
  });
});

// POST /api/skeo/library: admin add a resource (by link).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, category, url, description } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const item = await LibraryItem.create({ title, category: category || 'Note', url: url || '', description: description || '' });
  res.status(201).json({ item });
});

// DELETE /api/skeo/library/:id, admin only.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await LibraryItem.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;

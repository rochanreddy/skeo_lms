import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Program } from '../models/Program.js';
import { parseDocToModules } from '../utils/docparse.js';

const router = Router();

// In-memory upload for doc import (we parse the buffer, we don't store the file).
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Admin module-block: strip blocked curriculum modules from what a non-admin
// user sees. The module simply doesn't exist for them (Learning, progress UI).
function withoutBlockedModules(program, user) {
  const blocked = new Set((user.blocked?.moduleIds || []).map(String));
  if (user.role === 'admin' || blocked.size === 0) return program;
  const p = program.toObject();
  p.modules = (p.modules || []).filter((m) => !blocked.has(String(m._id)));
  return p;
}

// GET /api/skeo/programs — any logged-in user lists programs.
router.get('/', requireAuth, async (req, res) => {
  const programs = await Program.find().sort({ createdAt: -1 });
  res.json({ programs: programs.map((p) => withoutBlockedModules(p, req.user)) });
});

// GET /api/skeo/programs/:id — full curriculum tree.
router.get('/:id', requireAuth, async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program: withoutBlockedModules(program, req.user) });
});

// POST /api/skeo/programs — admin only.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, type, description, slug } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const program = await Program.create({ title, type: type || '', description: description || '', slug: slug || '' });
  res.status(201).json({ program });
});

// POST /api/skeo/programs/:id/import — admin uploads a
// .docx/.pdf/.md/.txt. Returns the auto-structured module tree as a PREVIEW
// (not saved) so it can be reviewed/edited before committing via PATCH.
router.post('/:id/import', requireAuth, requireRole('admin'), importUpload.single('file'), async (req, res) => {
  const target = await Program.findById(req.params.id).select('_id');
  if (!target) return res.status(404).json({ error: 'Program not found.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const { modules, stats } = await parseDocToModules(req.file.buffer, req.file.originalname || '');
    if (!modules.length) return res.status(422).json({ error: 'Could not find any structured content in that file. Add headings (e.g. # Module, ## Chapter, ### Lesson) and retry.' });
    res.json({ modules, stats, source: req.file.originalname });
  } catch (e) {
    res.status(422).json({ error: `Could not read that file: ${e.message}` });
  }
});

// PATCH /api/skeo/programs/:id — admin edits the program and its curriculum.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const target = await Program.findById(req.params.id).select('_id');
  if (!target) return res.status(404).json({ error: 'Program not found.' });

  const editable = ['title', 'type', 'description', 'slug', 'published', 'modules'];
  const allowed = {};
  for (const k of editable) if (req.body?.[k] !== undefined) allowed[k] = req.body[k];
  const program = await Program.findByIdAndUpdate(req.params.id, allowed, { new: true });
  res.json({ program });
});

export default router;

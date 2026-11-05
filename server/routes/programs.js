import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Program } from '../models/Program.js';
import { parseDocToModules } from '../utils/docparse.js';
import { sendShared } from '../utils/sharedBody.js';

const router = Router();

// In-memory upload for doc import (we parse the buffer, we don't store the file).
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Admin module-block: strip blocked curriculum modules from what a non-admin
// user sees. The module simply doesn't exist for them (Learning, progress UI).
//
// Takes either a document or a lean object — the list route reads lean, the
// detail route still hydrates.
function withoutBlockedModules(program, user) {
  const blocked = new Set((user.blocked?.moduleIds || []).map(String));
  if (user.role === 'admin' || blocked.size === 0) return program;
  const p = typeof program.toObject === 'function' ? program.toObject() : { ...program };
  p.modules = (p.modules || []).filter((m) => !blocked.has(String(m._id)));
  return p;
}

/* ── The list ────────────────────────────────────────────────────────────
 *
 * /programs is the largest response the API sends and the one it sends most:
 * every programme, with its whole module/chapter/topic tree, lesson bodies
 * included. Student home asks for it, Learning asks for it, and ⌘K reaches it.
 * Hundreds of kilobytes of BSON decoded into JS objects and serialised back to
 * JSON, every time — and the curriculum changes when an admin edits it, which
 * is to say almost never.
 *
 * So the finished body is shared (utils/sharedBody.js). Repeat callers skip the
 * query, the decode, the stringify and the gzip, and any write to a programme
 * clears it, by way of the hook on its schema.
 *
 * Keyed by which modules the caller cannot see, because that is the only thing
 * that varies between two users asking: everyone with no module blocks (which
 * is everyone, normally) shares one entry.
 */

/* Which shared body may be served to this user.
 *
 * Exported, and tested in tests/programsCacheKey.test.js, because getting it
 * wrong is the one way this cache could do real harm: two users must share an
 * entry only when withoutBlockedModules() would build them the same
 * curriculum, or one student's trimmed view gets served to another.
 *
 * Sorted, so the same block set written in a different order is the same key.
 * Admins are pinned to the empty key because withoutBlockedModules() returns
 * the whole programme for them whatever their blocked list says.
 */
export function listCacheKey(user) {
  if (user?.role === 'admin') return '';
  return [...new Set((user?.blocked?.moduleIds || []).map(String))].sort().join(',');
}

router.get('/', requireAuth, async (req, res) => {
  // Revalidate, don't re-download: express attaches an ETag to the body, so a
  // browser that already has this curriculum gets a 304 and reads it from its
  // own cache. 'private' keeps it out of any shared cache in between.
  res.set('Cache-Control', 'private, no-cache');
  await sendShared(req, res, `programs:${listCacheKey(req.user)}`, async () => {
    const programs = await Program.find().sort({ createdAt: -1 }).lean();
    return { programs: programs.map((p) => withoutBlockedModules(p, req.user)) };
  });
});

// GET /api/skeo/programs/:id — full curriculum tree.
router.get('/:id', requireAuth, async (req, res) => {
  const program = await Program.findById(req.params.id).lean();
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.set('Cache-Control', 'private, no-cache');
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

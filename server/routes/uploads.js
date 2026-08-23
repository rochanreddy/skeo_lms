import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { FileAsset } from '../models/FileAsset.js';

// Resume upload + read-back. Bytes go to Mongo (see models/FileAsset.js), never
// to disk, and they are served back through this authenticated route rather
// than a static mount -- a resume carries someone's name, phone and address, so
// holding the link should not be the same thing as being allowed to read it.

const MAX_BYTES = 5 * 1024 * 1024;

// What the Profile file picker offers (.pdf/.doc/.docx). Browsers disagree about
// the exact type they report for Office formats, so the extension is accepted as
// a fallback when the reported type is generic.
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXT = /\.(pdf|doc|docx)$/i;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

// Header-safe filename: no quotes, no newlines, nothing that could split headers.
const safeName = (s) => String(s || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);

const router = Router();

// POST /api/skeo/uploads  (multipart, field "file")
// Returns a ROOT-RELATIVE url. Nothing host-shaped is ever persisted, so the
// stored value survives a domain change and can't be written as http:// by a
// proxy that terminated TLS upstream.
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'That file is over the 5 MB limit.' : 'Upload failed.',
      });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const okType = ALLOWED_TYPES.has(req.file.mimetype) || ALLOWED_EXT.test(req.file.originalname || '');
    if (!okType) return res.status(415).json({ error: 'Only PDF and Word documents are accepted.' });

    try {
      const asset = await FileAsset.create({
        data: req.file.buffer,
        name: req.file.originalname || 'resume',
        mimeType: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        ownerId: req.user._id,
        kind: 'resume',
      });
      return res.status(201).json({ url: `/uploads/${asset._id}`, name: asset.name });
    } catch {
      return res.status(500).json({ error: 'Could not store the file.' });
    }
  });
});

// GET /api/skeo/uploads/:id — the owner, or an admin. Nobody else has a reason to read one.
router.get('/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });

  const asset = await FileAsset.findById(req.params.id).select('+data');
  if (!asset) return res.status(404).json({ error: 'Not found.' });

  const isOwner = String(asset.ownerId) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed.' });

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', asset.size);
  res.setHeader('Content-Disposition', `inline; filename="${safeName(asset.name)}"`);
  // Never let a browser sniff its way to executing one of these.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(asset.data);
});

export default router;

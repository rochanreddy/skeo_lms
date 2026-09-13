import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Webinar } from '../models/Webinar.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

/**
 * Accept a link, or nothing.
 *
 * This is rendered as an href a student clicks, so the scheme is checked here
 * rather than trusted: only http and https survive, which rules out
 * `javascript:` and `data:`. A bare `lu.ma/masterclass` is what someone
 * actually pastes, so it gets the https:// it meant rather than an error.
 */
function cleanUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch { return ''; }
}

/** The fields an admin can set, normalised. Shared by create and edit. */
function readBody(body = {}) {
  const out = {};
  if (body.title !== undefined) out.title = String(body.title).trim();
  if (body.note !== undefined) out.note = String(body.note);
  if (body.landingUrl !== undefined) out.landingUrl = cleanUrl(body.landingUrl);
  // '' clears a date that was set; anything else has to parse.
  if (body.startsAt !== undefined) out.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  return out;
}

const badDate = (d) => d instanceof Date && Number.isNaN(d.getTime());

// GET /api/skeo/webinars — everyone sees the same board, newest push first.
// The client splits it into what's coming and what's been.
router.get('/', requireAuth, async (_req, res) => {
  const webinars = await Webinar.find().sort({ createdAt: -1 }).limit(100);
  res.json({ webinars });
});

// POST /api/skeo/webinars — admin pushes a masterclass to the school.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const fields = readBody(req.body);
  if (!fields.title) return res.status(400).json({ error: 'A title is required.' });
  // A masterclass with no link to its page is a card that does nothing.
  if (!fields.landingUrl) return res.status(400).json({ error: 'Add the masterclass link (http or https).' });
  if (badDate(fields.startsAt)) return res.status(400).json({ error: 'That date could not be read.' });

  const webinar = await Webinar.create({ ...fields, postedBy: req.user._id });

  // The push. Everyone learning here hears about it; nobody has to go looking.
  const students = await User.find({ role: 'student', 'blocked.lms': { $ne: true } }).select('_id').lean();
  notifyMany(students.map((s) => s._id), {
    type: 'webinar',
    text: `🎥 Masterclass: ${webinar.title}`,
    link: '/app/webinars',
  });

  res.status(201).json({ webinar });
});

// PATCH /api/skeo/webinars/:id — fix a title, a link or a date.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const fields = readBody(req.body);
  if ('title' in fields && !fields.title) return res.status(400).json({ error: 'A title is required.' });
  if ('landingUrl' in fields && !fields.landingUrl) return res.status(400).json({ error: 'Add the masterclass link (http or https).' });
  if (badDate(fields.startsAt)) return res.status(400).json({ error: 'That date could not be read.' });

  const webinar = await Webinar.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
  if (!webinar) return res.status(404).json({ error: 'Not found.' });
  res.json({ webinar });
});

// DELETE /api/skeo/webinars/:id — admin only.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await Webinar.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { Program } from '../models/Program.js';
import {
  VdoError,
  createOtp,
  createUploadCredentials,
  deleteVideo,
  getVideo,
  isConfigured,
  listVideos,
  watermarkFor,
} from '../utils/vdocipher.js';

// VdoCipher playback and library management.
//
// The only thing a student is ever given is an OTP that expires in minutes and
// is minted for one video they are already entitled to see. The account secret
// stays on the server, so "knowing the video id" is not the same thing as being
// able to watch it -- which is the property the whole DRM setup rests on.

const router = Router();

const OTP_TTL_SECONDS = 300;

// Turns a thrown VdoError into its own status; anything else is a 500 for the
// error handler. Routes stay linear this way.
const fail = (res, e) =>
  e instanceof VdoError ? res.status(e.status).json({ error: e.message }) : null;

/**
 * Is this user allowed to watch this video? Admins always are. For everyone
 * else the video has to be attached to a lesson in some program, in a module
 * the admin has not blocked for them -- the same visibility rule
 * routes/programs.js applies to the curriculum itself.
 */
async function canWatch(user, videoId) {
  if (user.role === 'admin') return true;
  const program = await Program.findOne({ 'modules.chapters.topics.vdoVideoId': videoId })
    .select('modules')
    .lean();
  if (!program) return false;

  const blocked = new Set((user.blocked?.moduleIds || []).map(String));
  return (program.modules || []).some(
    (m) =>
      !blocked.has(String(m._id)) &&
      (m.chapters || []).some((c) => (c.topics || []).some((t) => t.vdoVideoId === videoId)),
  );
}

// GET /api/skeo/videos/config — can the UI offer VdoCipher at all? Cheap, and
// it keeps the admin editor from showing a feature the server cannot serve.
router.get('/config', requireAuth, (_req, res) => res.json({ configured: isConfigured() }));

// POST /api/skeo/videos/:videoId/otp — a playback ticket for the caller.
// Rate-limited because an OTP is a paid upstream call, and one player needs one.
router.post(
  '/:videoId/otp',
  requireAuth,
  rateLimit({ bucket: 'vdo-otp', max: 60, windowMs: 60_000, message: 'Too many playback requests. Try again in a minute.' }),
  async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ error: 'Video hosting is not configured on this server.' });

    const { videoId } = req.params;
    // Ids are opaque hex from VdoCipher; refuse anything else before it reaches
    // the upstream or a Mongo query.
    if (!/^[a-zA-Z0-9]{8,64}$/.test(videoId)) return res.status(404).json({ error: 'Video not found.' });

    if (!(await canWatch(req.user, videoId))) {
      // Deliberately the same answer as a missing video: whether a video exists
      // is not something a student who cannot watch it needs to learn.
      return res.status(404).json({ error: 'Video not found.' });
    }

    try {
      const { otp, playbackInfo } = await createOtp(videoId, {
        ttl: OTP_TTL_SECONDS,
        annotate: watermarkFor(req.user),
      });
      return res.json({ otp, playbackInfo, ttl: OTP_TTL_SECONDS });
    } catch (e) {
      return fail(res, e) || res.status(502).json({ error: 'Could not start playback.' });
    }
  },
);

// GET /api/skeo/videos — the account's library, for the admin lesson picker.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); // VdoCipher pages start at 1
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
  try {
    const data = await listVideos({ page, limit, q: String(req.query.q || '').trim() });
    return res.json({ videos: data.rows || [], count: data.count ?? (data.rows || []).length, page, limit });
  } catch (e) {
    return fail(res, e) || res.status(502).json({ error: 'Could not list videos.' });
  }
});

// POST /api/skeo/videos/upload — credentials for a direct browser upload.
// We never take the bytes ourselves: a lecture recording is far past what this
// API should be proxying, and VdoCipher signs a payload good for one video.
router.post('/upload', requireAuth, requireRole('admin'), async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  try {
    return res.status(201).json(await createUploadCredentials(title.slice(0, 200)));
  } catch (e) {
    return fail(res, e) || res.status(502).json({ error: 'Could not start the upload.' });
  }
});

// GET /api/skeo/videos/:videoId — metadata (name, status, length, poster).
// Admin only: it is how the editor shows what a stored id actually points at,
// and how it reports that a fresh upload is still encoding.
router.get('/:videoId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    return res.json({ video: await getVideo(req.params.videoId) });
  } catch (e) {
    return fail(res, e) || res.status(502).json({ error: 'Could not read that video.' });
  }
});

// DELETE /api/skeo/videos/:videoId — removes it from VdoCipher for good. Any
// lesson still pointing at the id keeps the id; playback then 404s, the same as
// a dead link, rather than the curriculum silently rewriting itself.
router.delete('/:videoId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await deleteVideo(req.params.videoId);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e) || res.status(502).json({ error: 'Could not delete that video.' });
  }
});

export default router;

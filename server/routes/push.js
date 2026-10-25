import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { isPushEndpoint, pushEnabled, sendPush, vapidPublicKey } from '../utils/push.js';

const router = Router();

// A device can hold on to a dozen stale subscriptions over a year of browser
// updates and reinstalls. Past this many the oldest go, so one account can
// never make every notification fan out to hundreds of endpoints.
const MAX_PER_USER = 10;

const isKey = (s) => typeof s === 'string' && s.length > 0 && s.length <= 256 && /^[A-Za-z0-9_-]+=*$/.test(s);

// GET /api/skeo/push/key — public. Whether push is on, and the key a browser
// needs to subscribe. Served rather than baked into the client build, so
// turning push on is a server env change and not a frontend redeploy.
router.get('/key', (_req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
});

// POST /api/skeo/push/subscribe — { subscription } as PushSubscription.toJSON()
// gives it. Idempotent: the client sends it on every launch, which is also how
// a subscription the browser silently rotated finds its way back here.
router.post('/subscribe', requireAuth, async (req, res) => {
  if (!pushEnabled()) return res.status(503).json({ error: 'Push notifications are not set up on this server.' });

  const { endpoint, keys } = req.body?.subscription || {};
  if (!isPushEndpoint(endpoint) || !isKey(keys?.p256dh) || !isKey(keys?.auth)) {
    return res.status(400).json({ error: 'That is not a push subscription this server can use.' });
  }

  await PushSubscription.updateOne(
    { endpoint },
    {
      $set: {
        userId: req.user._id,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      },
    },
    { upsert: true },
  );

  const extra = await PushSubscription.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .skip(MAX_PER_USER)
    .select('_id')
    .lean();
  if (extra.length) await PushSubscription.deleteMany({ _id: { $in: extra.map((s) => s._id) } });

  res.json({ ok: true });
});

// POST /api/skeo/push/unsubscribe — { endpoint }. Sent when alerts are turned
// off and on sign-out, so the next person on a shared phone does not receive
// the last one's grades. Scoped to the caller: nobody can drop someone else's.
router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint === 'string' && endpoint) {
    await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  }
  res.json({ ok: true });
});

// POST /api/skeo/push/test — a notification to the caller's own devices, sent
// the moment alerts are turned on, so the student sees one arrive rather than
// taking it on trust. Tightly limited: it is a button that sends pushes.
router.post(
  '/test',
  requireAuth,
  rateLimit({ bucket: 'push-test', max: 5, windowMs: 60_000 }),
  async (req, res) => {
    if (!pushEnabled()) return res.status(503).json({ error: 'Push notifications are not set up on this server.' });
    await sendPush([req.user._id], {
      title: 'Notifications are on',
      text: 'Grades, new work and replies will show up here.',
      link: '/app',
    });
    res.json({ ok: true });
  },
);

export default router;

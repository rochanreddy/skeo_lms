import crypto from 'crypto';
import { Router } from 'express';
import { provisionOrder, sendPlaybooks } from '../utils/provision.js';

// POST /api/skeo/provision — the website's server, and nothing else, tells the
// LMS that an order has been paid for.
//
// There is no user session here: the caller is skeoai.com's backend, after
// Cashfree has confirmed the payment. It proves itself with PROVISION_SECRET,
// a value only the two servers hold, sent as a Bearer token. Without that
// value set here the route refuses everything — an unconfigured endpoint that
// hands out accounts is the one thing this must never be.
const router = Router();

function authorised(req) {
  const secret = process.env.PROVISION_SECRET || '';
  if (secret.length < 32) return false;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/', async (req, res) => {
  if (!authorised(req)) return res.status(401).json({ error: 'Not authorised.' });
  const { orderId, email, name, phone, items } = req.body || {};
  try {
    const result = await provisionOrder({
      orderId: String(orderId || '').trim(),
      email,
      name,
      phone,
      items: Array.isArray(items) ? items.map(String) : [],
    });
    if (result.warnings?.length) console.warn(`[provision] ${result.orderId}:`, result.warnings.join(' | '));
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[provision] ${orderId} failed:`, err.message);
    return res.status(status).json({ error: err.message || 'Provisioning failed.' });
  }
});

// POST /api/skeo/provision/playbooks — the admin panel's Send / Resend.
// { email, name?, sets: ['claude' | 'ai'], orderId? }. Same secret as above:
// the website's admin API calls it on the admin's behalf.
router.post('/playbooks', async (req, res) => {
  if (!authorised(req)) return res.status(401).json({ error: 'Not authorised.' });
  const { email, name, sets, orderId } = req.body || {};
  try {
    const result = await sendPlaybooks({
      email,
      name,
      sets: Array.isArray(sets) ? sets.map(String) : [],
      orderId: String(orderId || '').trim(),
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[provision/playbooks] failed:', err.message);
    return res.status(status).json({ error: err.message || 'Could not send the playbooks.' });
  }
});

export default router;

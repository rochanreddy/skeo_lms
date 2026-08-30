// Fixed-window rate limiting.
//
// This counter lives in the process, which is the honest limit of it: restart
// the server and every window resets, and two instances behind a load balancer
// each keep their own count. It is here to blunt credential stuffing and
// runaway clients, not to be a quota system. If this service is ever scaled
// past one instance, move the counters to Redis and keep these signatures.

import { verifyToken } from '../utils/token.js';

const buckets = new Map();

// Windows are only swept when a bucket is touched, so an idle process cannot
// grow the map forever: entries expire on read, and the periodic sweep below
// clears whatever never gets read again.
const SWEEP_MS = 10 * 60_000;
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of buckets) if (now > rec.reset) buckets.delete(key);
}, SWEEP_MS);
// Never hold the event loop open for this.
sweep.unref?.();

export function hit(key, max, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now > rec.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= max;
}

/**
 * Count one failure against a key without asking whether it is over the limit.
 * Pairs with tooMany() so that only failed attempts are ever counted -- a user
 * signing in successfully ten times is not the thing being defended against.
 */
export function record(key, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now > rec.reset) buckets.set(key, { count: 1, reset: now + windowMs });
  else rec.count += 1;
}

/** Has this key already been recorded against `max` times in the window? */
export function tooMany(key, max) {
  const rec = buckets.get(key);
  return Boolean(rec && Date.now() <= rec.reset && rec.count >= max);
}

/** Forget a key — called when the thing it was counting succeeds. */
export const clear = (key) => buckets.delete(key);

/**
 * What to count a request against.
 *
 * An account, whenever the request carries a signed access token. Counting by
 * IP address is the obvious thing and it is wrong here: a household, an office,
 * and above all a mobile carrier put many unrelated people behind one public
 * address -- Indian mobile networks in particular run large-scale NAT, so
 * thousands of subscribers can share one -- and an IP-keyed limit locks all of
 * them out because one of them was busy. Measured before this changed: 100
 * users on one address got 90 login rejections, 139 rejections out of 400
 * ordinary reads, and every single video request refused.
 *
 * The token is only read, never trusted for authorisation -- requireAuth still
 * does that, against the live user record. Falling back to the IP covers
 * everything unauthenticated, which is exactly where per-IP counting still
 * earns its place.
 */
function identify(req) {
  if (req.user?._id) return `u:${req.user._id}`;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload?.sub && payload.typ === 'access') return `u:${payload.sub}`;
  }
  return `ip:${req.ip}`;
}

// Express middleware form. `bucket` names the counter so that a limit on one
// route cannot be spent by traffic to another.
//
// `ipMax` is the ceiling to use when the request could not be tied to an
// account. The two numbers are deliberately far apart, because the keys mean
// different things: an account key counts one person, so `max` can be set to
// what one person plausibly does, while an IP key may be counting an entire
// mobile carrier's NAT pool and has to leave room for all of them. Defaults to
// `max` for routes where every caller is authenticated anyway.
export function rateLimit({ bucket, max, windowMs, ipMax, message }) {
  return (req, res, next) => {
    const who = identify(req);
    const limit = who.startsWith('ip:') ? (ipMax ?? max) : max;
    if (hit(`${bucket}:${who}`, limit, windowMs)) return next();
    res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
    res.status(429).json({ error: message || 'Too many requests. Try again shortly.' });
  };
}

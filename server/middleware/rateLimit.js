// Fixed-window rate limiting, per IP + bucket.
//
// This counter lives in the process, which is the honest limit of it: restart
// the server and every window resets, and two instances behind a load balancer
// each keep their own count. It is here to blunt credential stuffing and
// runaway clients, not to be a quota system. If this service is ever scaled
// past one instance, move the counters to Redis and keep this signature.

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

// Express middleware form. `bucket` names the counter so that a limit on one
// route cannot be spent by traffic to another.
export function rateLimit({ bucket, max, windowMs, message }) {
  return (req, res, next) => {
    if (hit(`${bucket}:${req.ip}`, max, windowMs)) return next();
    res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
    res.status(429).json({ error: message || 'Too many requests. Try again shortly.' });
  };
}

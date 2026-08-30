import { User, ROLES } from '../models/User.js';
import { verifyToken } from '../utils/token.js';

// ── The user cache ────────────────────────────────────────────────────────
//
// requireAuth runs on every authenticated request and used to load the user
// from the database each time. Measured under a hundred concurrent students,
// that single lookup was 300 of the 400 database operations per second the app
// generated -- three quarters of our entire database load, spent re-reading a
// row that had not changed since the request half a second earlier.
//
// So it is cached, briefly. The cost is precision on access changes: a block or
// a role change lands within TTL_MS rather than on the very next request. Two
// things keep that window from mattering. The TTL is small enough to be shorter
// than a person notices, and every route that changes a user's access calls
// forget() so the block is immediate on the instance that made it. What remains
// is the multi-instance case, where another process may serve one stale request
// -- the same limitation the rate limiter carries, and the same fix (Redis) if
// this is ever scaled past one instance.
//
// Entries hold the lean document; each request gets its own hydrated copy, so
// a route that mutates req.user (me.js changes the password on it) cannot
// disturb the cache or another request in flight.
const TTL_MS = 5_000;
const MAX_ENTRIES = 5_000;
const cache = new Map();

/**
 * Drop a user's cached record. Call this from anywhere that changes what the
 * user is allowed to do, so the change takes effect on the next request rather
 * than at the end of the TTL.
 */
export function forget(userId) {
  if (userId) cache.delete(String(userId));
}

/** Cached lean user record, or null. Refreshes on miss or expiry. */
async function loadUser(id) {
  const key = String(id);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.doc;

  const doc = await User.findById(id).lean();
  if (!doc) {
    cache.delete(key);
    return null;
  }
  // A crude bound. The map only ever holds users active in the last few
  // seconds, so this is a backstop against pathological traffic, not a policy.
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { doc, expires: Date.now() + TTL_MS });
  return doc;
}

/** Reads the Bearer token, loads the user, or null. */
async function getUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub || payload.typ !== 'access') return null;

  const doc = await loadUser(payload.sub);
  // Hydrate rather than hand back the cached object: routes expect a real
  // document (toPublic, save), and hydrate deep-copies, so each request gets an
  // isolated one.
  return doc ? User.hydrate(doc) : null;
}

// Only re-stamp lastActiveAt this often — otherwise every request is a write.
const ACTIVITY_THROTTLE_MS = 15 * 60 * 1000;

/** Express guard — 401s without a valid access token. */
export async function requireAuth(req, res, next) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });

  // Accounts with a retired/unknown role (e.g. legacy 'partner') have no
  // access anywhere — reject at the chokepoint rather than in every route.
  if (!ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'Your account role no longer has access.', code: 'blocked' });
  }

  // Admin-blocked accounts are locked out of every endpoint. Admins themselves
  // are never blockable. This reads the cached record, so an admin's block
  // takes effect on the next request after forget() — see the note above.
  if (user.role !== 'admin' && user.blocked?.lms) {
    return res.status(403).json({
      error: user.blocked?.reason
        ? `Your account has been blocked: ${user.blocked.reason}`
        : 'Your account has been blocked by the administrator.',
      code: 'blocked',
    });
  }
  req.user = user;

  // Fire-and-forget last-seen tracking: never blocks or fails the request.
  if (Date.now() - (user.lastActiveAt?.getTime() || 0) > ACTIVITY_THROTTLE_MS) {
    const at = new Date();
    user.lastActiveAt = at;
    // Stamp the cached copy too, or the throttle above reads the old value and
    // re-fires this write on every request until the entry expires.
    const hit = cache.get(String(user._id));
    if (hit) hit.doc.lastActiveAt = at;
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: at } }).catch(() => {});
  }

  next();
}

/**
 * Role gate — use AFTER requireAuth:
 *   router.post('/programs', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role.' });
    }
    next();
  };
}

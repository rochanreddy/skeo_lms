import { User, ROLES } from '../models/User.js';
import { verifyToken } from '../utils/token.js';

/** Reads the Bearer token, loads the user, or null. */
async function getUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub || payload.typ !== 'access') return null;
  return User.findById(payload.sub);
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

  // Admin-blocked accounts are locked out of every endpoint. Checked on the
  // live user doc, so a block takes effect on the very next request — no token
  // invalidation needed. Admins themselves are never blockable.
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

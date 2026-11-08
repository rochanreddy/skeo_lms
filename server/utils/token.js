import { createSecretKey } from 'node:crypto';
import jwt from 'jsonwebtoken';

// Stateless Bearer tokens (Authorization: Bearer <token>). The LMS frontend
// stores the access token and sends it on every request.
// Fail loudly rather than quietly signing with a secret that is published in
// this repo: a missing JWT_SECRET in production would let anyone mint an admin
// token, and the server would look perfectly healthy while they did it.
const SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set. Refusing to start with a known signing key.');
  }
  console.warn('[auth] JWT_SECRET unset: using the insecure dev key. Never run this in production.');
  return 'dev-insecure-lms-secret-change-me';
})();

/* A key object, not the string. Handed a string, jsonwebtoken first tries to
 * parse it as a PEM public key, which fails by throwing, and only then treats it
 * as the HMAC secret it is -- on every verification, every authenticated
 * request. Profiled under load, that exception was about 5% of the server's CPU.
 * This is the same key and the same HMAC: tokens already issued stay valid, and
 * a secret-type key only ever matches the HS* algorithms, as before.
 */
const KEY = createSecretKey(Buffer.from(SECRET));

const ACCESS_TTL = '2h';
const REFRESH_TTL = '30d';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, typ: 'access' }, KEY, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), typ: 'refresh' }, KEY, { expiresIn: REFRESH_TTL });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, KEY);
  } catch {
    return null;
  }
}

/**
 * The verified access-token payload for this request, computed once.
 *
 * Two pieces of middleware want it on every single request: the rate limiter,
 * to decide whether to count against an account or an IP address, and
 * requireAuth, to find out who is calling. Each used to read the header and
 * verify the signature itself, so every authenticated request paid for an
 * HMAC twice -- measured at 43us a time, which at any real request rate is a
 * visible slice of a small instance's CPU, spent proving the same thing twice.
 *
 * Memoised on the request object, which lives exactly as long as the answer is
 * valid. Returns null for anything that is not a good access token: no header,
 * a bad signature, an expired token, or a refresh token presented in its place.
 */
export function accessPayload(req) {
  if (req.skeoAccess !== undefined) return req.skeoAccess;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = token ? verifyToken(token) : null;
  req.skeoAccess = payload?.sub && payload.typ === 'access' ? payload : null;
  return req.skeoAccess;
}

/**
 * True when the token was issued before the user's last password reset, so it
 * belongs to a session the reset was meant to end. JWT `iat` is in whole
 * seconds; comparing against the reset's own second keeps a token minted in
 * the same second as the reset (a sign-in right after it) valid.
 */
export function issuedBeforeReset(payload, user) {
  const at = user?.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
  if (!at) return false;
  return Number(payload?.iat || 0) < Math.floor(at / 1000);
}

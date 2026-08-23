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
  console.warn('[auth] JWT_SECRET unset — using the insecure dev key. Never run this in production.');
  return 'dev-insecure-lms-secret-change-me';
})();
const ACCESS_TTL = '2h';
const REFRESH_TTL = '30d';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, typ: 'access' }, SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), typ: 'refresh' }, SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { User, ROLES } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/token.js';
import { isSmtpConfigured, sendMail } from '../utils/email.js';
import { hit as rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const APP_URL = () => (process.env.SKEO_APP_URL || 'http://localhost:5175').replace(/\/+$/, '');

// POST /api/skeo/auth/register — self-signup is forced to role=student.
router.post('/register', async (req, res) => {
  try {
    if (!rateLimit(`register:${req.ip}`, 5, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, password, fullName, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const clean = String(email).toLowerCase().trim();
    if (await User.findOne({ email: clean })) return res.status(409).json({ error: 'An account with this email already exists.' });

    const user = await User.create({
      email: clean,
      passwordHash: await bcrypt.hash(String(password), 12),
      fullName: fullName || '',
      phone: phone || '',
      role: 'student',
    });
    return res.status(201).json({ user: user.toPublic(), accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Could not register.' });
  }
});

// POST /api/skeo/auth/login
router.post('/login', async (req, res) => {
  try {
    if (!rateLimit(`login:${req.ip}`, 10, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
    const ok = user && user.passwordHash && (await bcrypt.compare(String(password || ''), user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
    // Retired/unknown roles (e.g. legacy 'partner' accounts) cannot sign in.
    if (!ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Your account role no longer has access to this portal.' });
    }
    if (user.role !== 'admin' && user.blocked?.lms) {
      return res.status(403).json({
        error: user.blocked?.reason
          ? `Your account has been blocked: ${user.blocked.reason}`
          : 'Your account has been blocked by the administrator.',
        code: 'blocked',
      });
    }
    return res.json({ user: user.toPublic(), accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Could not log in.' });
  }
});

// POST /api/skeo/auth/refresh
router.post('/refresh', async (req, res) => {
  const payload = verifyToken(req.body?.refreshToken);
  if (!payload?.sub || payload.typ !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token.' });
  const user = await User.findById(payload.sub);
  if (!user) return res.status(401).json({ error: 'Invalid refresh token.' });
  if (!ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'Your account role no longer has access to this portal.' });
  }
  if (user.role !== 'admin' && user.blocked?.lms) {
    return res.status(403).json({ error: 'Your account has been blocked by the administrator.', code: 'blocked' });
  }
  return res.json({ accessToken: signAccessToken(user), user: user.toPublic() });
});

// POST /api/skeo/auth/forgot — always returns success (no account enumeration).
router.post('/forgot', async (req, res) => {
  try {
    if (!rateLimit(`forgot:${req.ip}`, 5, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const email = String(req.body?.email || '').toLowerCase().trim();
    const user = await User.findOne({ email });
    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = hashToken(raw);
      user.resetExpires = new Date(Date.now() + 1000 * 60 * 30);
      await user.save();
      const link = `${APP_URL()}/reset?token=${raw}&email=${encodeURIComponent(email)}`;
      if (isSmtpConfigured()) await sendMail({ to: email, subject: 'Reset your Skeo LMS password', text: `Reset your password:\n\n${link}\n\nExpires in 30 minutes.` });
      else console.log('[forgot] SMTP off — reset link:', link);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('forgot error:', err);
    return res.json({ ok: true });
  }
});

// POST /api/skeo/auth/reset
router.post('/reset', async (req, res) => {
  try {
    const { email, token, password } = req.body || {};
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const user = await User.findOne({
      email: String(email || '').toLowerCase().trim(),
      resetTokenHash: hashToken(String(token || '')),
      resetExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    user.passwordHash = await bcrypt.hash(String(password), 12);
    user.resetTokenHash = '';
    user.resetExpires = null;
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('reset error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

export default router;

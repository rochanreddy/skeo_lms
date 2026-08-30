import { Router } from 'express';
import crypto from 'crypto';
import { hashPassword, needsRehash, verifyPassword } from '../utils/password.js';

import { User, ROLES } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/token.js';
import { isSmtpConfigured, sendMail } from '../utils/email.js';
import { clear, hit as rateLimit, record, tooMany } from '../middleware/rateLimit.js';

const router = Router();

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const APP_URL = () => (process.env.SKEO_APP_URL || 'http://localhost:5175').replace(/\/+$/, '');

// POST /api/skeo/auth/register — self-signup is forced to role=student.
router.post('/register', async (req, res) => {
  try {
    // Wide, for the NAT reason in /login. Signup has no per-account equivalent
    // to lean on -- spam signups use a fresh address every time -- so this is
    // the only brake there is, sized to stop a script rather than a crowd.
    if (!rateLimit(`register:${req.ip}`, 200, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, password, fullName, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const clean = String(email).toLowerCase().trim();
    if (await User.findOne({ email: clean })) return res.status(409).json({ error: 'An account with this email already exists.' });

    const user = await User.create({
      email: clean,
      passwordHash: await hashPassword(password),
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
    // Two limits, because they defend against two different things, and only
    // one of them can be tight.
    //
    // The per-account one is the real brake on password guessing. It counts only
    // FAILED attempts -- someone signing in correctly ten times is not an attack,
    // and counting their successes was locking them out -- and it keys on the
    // account, so it holds no matter where the attempt came from.
    //
    // The per-IP one cannot be tight, and that is the point. On mobile data an
    // address is not a person: carriers put thousands of unrelated subscribers
    // behind one, so anything sized for a single user locks all of them out. It
    // stays only as a wide backstop against one machine spraying a common
    // password across many different accounts -- the one attack the per-account
    // limit cannot see, because it never touches the same account twice.
    const { email, password } = req.body || {};
    const clean = String(email || '').toLowerCase().trim();
    const failures = `login-fail:${clean}`;
    if (tooMany(failures, 8)) return res.status(429).json({ error: 'Too many failed attempts for this account. Try again in a minute.' });
    if (!rateLimit(`login-ip:${req.ip}`, 600, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });

    const user = await User.findOne({ email: clean });
    const ok = user && (await verifyPassword(password, user.passwordHash));
    if (!ok) {
      record(failures, 60_000);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    // Signed in -- a run of typos before getting it right should not count.
    clear(failures);
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
    // Every account created before utils/password.js was hashed at the old,
    // four-times-costlier setting, and would keep paying it at every login for
    // the life of the account. A correct password is the one moment the
    // plaintext is available to rewrite it, so take it -- in the background,
    // because the user's response should not wait on a housekeeping write.
    if (needsRehash(user.passwordHash)) {
      hashPassword(password)
        .then((passwordHash) => User.updateOne({ _id: user._id }, { $set: { passwordHash } }))
        .catch((e) => console.error('rehash failed for', user._id, e));
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
    if (!rateLimit(`forgot:${req.ip}`, 200, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const email = String(req.body?.email || '').toLowerCase().trim();
    // The limit that actually matters here, and it keys on the target rather
    // than the sender: without it anyone can have this server mail the same
    // person a reset link a thousand times. Counted against the address that
    // was typed in, so it still says nothing about whether that address has an
    // account -- an unregistered one is throttled exactly the same way.
    if (!rateLimit(`forgot-email:${email}`, 3, 15 * 60_000)) {
      return res.status(429).json({ error: 'A reset link was already sent. Check your inbox, or try again in a few minutes.' });
    }
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
    user.passwordHash = await hashPassword(password);
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

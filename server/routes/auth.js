import { Router } from 'express';
import crypto from 'crypto';
import { hashPassword, needsRehash, verifyPassword } from '../utils/password.js';

import { User, ROLES } from '../models/User.js';
import { hasPaidAccess, trialEnded, TRIAL_ENDED_MESSAGE } from '../utils/access.js';
import { forget } from '../middleware/auth.js';
import { issuedBeforeReset, signAccessToken, signRefreshToken, verifyToken } from '../utils/token.js';
import { trySendMail } from '../utils/email.js';
import { appUrl } from '../utils/appUrl.js';
import { passwordChangedEmail, resetEmail } from '../utils/resetEmail.js';
import { clear, hit as rateLimit, record, tooMany } from '../middleware/rateLimit.js';

const router = Router();

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// POST /api/skeo/auth/register: closed.
//
// A skeo account is made by paying for a plan on skeoai.com: the website tells
// the LMS once Cashfree confirms the money (routes/provision.js), and the LMS
// mails the login. Open self-signup made accounts with nothing paid for, which
// opened onto an empty LMS, so it now answers the way login does for a
// non-buyer, and the client sends them to the plans.
router.post('/register', (_req, res) => res.status(403).json({
  error: 'skeo accounts are created when you buy a plan.',
  code: 'not_purchased',
}));

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
    // No account at all: on skeo an account is what a purchase makes, so the
    // useful answer is where to buy one, not "invalid password", which would
    // send someone who has never paid off to reset a password they never had.
    // Saying so reveals no more than /register's "already exists" always has.
    // Still counted as a failure, so the per-account limit holds for guesses.
    if (!user) {
      record(failures, 60_000);
      return res.status(401).json({
        error: 'There is no skeo account for this email yet. Accounts are created when you buy a plan.',
        code: 'not_purchased',
      });
    }
    const ok = await verifyPassword(password, user.passwordHash);
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
    // An account with nothing paid for, made through the old open sign-up,
    // say: would open onto an empty LMS. Point it at the plans instead.
    if (user.role === 'student' && !(await hasPaidAccess(user))) {
      return res.status(403).json({
        error: trialEnded(user) ? TRIAL_ENDED_MESSAGE : 'Your account does not have a skeo plan yet.',
        code: 'not_purchased',
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
        .then(() => forget(user._id))
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
  // Signed in before the password was reset: that session is over.
  if (issuedBeforeReset(payload, user)) return res.status(401).json({ error: 'Your password was changed. Please sign in again.' });
  if (!ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'Your account role no longer has access to this portal.' });
  }
  if (user.role !== 'admin' && user.blocked?.lms) {
    return res.status(403).json({ error: 'Your account has been blocked by the administrator.', code: 'blocked' });
  }
  // The same gate as login, so a session begun before it existed does not
  // outlive it.
  if (user.role === 'student' && !(await hasPaidAccess(user))) {
    return res.status(403).json({ error: trialEnded(user) ? TRIAL_ENDED_MESSAGE : 'Your account does not have a skeo plan yet.', code: 'not_purchased' });
  }
  return res.json({ accessToken: signAccessToken(user), user: user.toPublic() });
});

// POST /api/skeo/auth/forgot: always returns success (no account enumeration).
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
      // No time limit: the link stays good until it is used, or until a newer
      // reset request replaces it.
      user.resetExpires = null;
      await user.save();
      // appUrl, not SKEO_APP_URL directly: that variable can be a comma list
      // (it doubles as the CORS allowlist), and a link built from the raw value
      // points at a host that does not exist.
      const link = appUrl(`/reset?token=${raw}&email=${encodeURIComponent(email)}`);
      /* sendMail picks its own way out (ZeptoMail, Resend, SMTP, then the
         console), so this does not ask which provider is configured.

         Not awaited, and trySendMail rather than sendMail, for the same reason:
         the answer here must be identical whether or not the address has an
         account. Waiting on the provider would make a real address measurably
         slower to answer than an unknown one, and a send error escaping would
         turn it into a 500. Either one tells a stranger who is registered. */
      trySendMail({ to: email, ...resetEmail({ fullName: user.fullName, email, link }) })
        .then((mail) => {
          if (!mail.emailed) console.log('[forgot] not delivered (' + (mail.error || 'no transport configured') + '): reset link:', link);
        });
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
    if (!rateLimit(`reset:${req.ip}`, 30, 15 * 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, token, password } = req.body || {};
    if (typeof password !== 'string' || typeof token !== 'string') return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const user = await User.findOne({
      email: String(email || '').toLowerCase().trim(),
      resetTokenHash: hashToken(String(token || '')),
    });
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
    user.passwordHash = await hashPassword(password);
    // One use only: the link dies with the reset.
    user.resetTokenHash = '';
    user.resetExpires = null;
    // They have just chosen their own password, which is all the forced
    // change after an admin reset or a provisioned account was asking for.
    user.mustChangePassword = false;
    // Ends every session that was open before now (see issuedBeforeReset).
    user.passwordChangedAt = new Date();
    await user.save();
    forget(user._id);
    trySendMail({
      to: user.email,
      ...passwordChangedEmail({ fullName: user.fullName, email: user.email, loginUrl: appUrl('/login') }),
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('reset error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

export default router;

import { Router } from 'express';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { requireAuth } from '../middleware/auth.js';
import { forget } from '../middleware/auth.js';

const router = Router();

// GET /api/skeo/me — the frontend calls this on load to pick which dashboard
// (student/admin) to render.
router.get('/', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// PATCH /api/skeo/me/password — change your own password.
// - Voluntary change: requires the current password.
// - Forced first change (mustChangePassword, set by admin on provision/reset):
//   no current password needed — the user is already authenticated this session.
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const u = req.user;
  if (!u.mustChangePassword) {
    const ok = u.passwordHash && (await verifyPassword(currentPassword, u.passwordHash));
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  u.passwordHash = await hashPassword(newPassword);
  u.mustChangePassword = false;
  await u.save();
  forget(u._id);
  res.json({ ok: true, user: u.toPublic() });
});

// PATCH /api/skeo/me — update own Profile tab.
router.patch('/', requireAuth, async (req, res) => {
  const u = req.user;
  const { fullName, phone, education, professional, resumeUrl } = req.body || {};
  if (fullName !== undefined) u.fullName = fullName;
  if (phone !== undefined) u.phone = phone;
  if (education !== undefined) u.education = education;
  if (professional !== undefined) u.professional = professional;
  if (resumeUrl !== undefined) u.resumeUrl = resumeUrl;
  await u.save();
  forget(u._id);
  res.json({ user: u.toPublic() });
});

export default router;

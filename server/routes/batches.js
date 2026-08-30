import { Router } from 'express';
import crypto from 'crypto';
import { hashPassword } from '../utils/password.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { canAccessBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/skeo/batches — role-scoped: admin=all, student=their own batches.
router.get('/', requireAuth, async (req, res) => {
  const ids = await myBatchIds(req.user);
  const batches = await Batch.find({ _id: { $in: ids } })
    .populate('programId', 'title')
    .sort({ createdAt: -1 });
  res.json({
    batches: batches.map((b) => ({
      id: b._id, name: b.name, status: b.status,
      program: b.programId?.title || '', programId: b.programId?._id,
      startDate: b.startDate, endDate: b.endDate,
      studentCount: b.studentIds.length,
    })),
  });
});

// GET /api/skeo/batches/:id — full batch with roster (members + admin only).
router.get('/:id', requireAuth, async (req, res) => {
  if (!(await canAccessBatch(req.user, req.params.id))) return res.status(403).json({ error: 'Forbidden.' });
  // Block state (and its reason) is admin-only information.
  const memberFields = req.user.role === 'admin' ? 'fullName email blocked' : 'fullName email';
  const b = await Batch.findById(req.params.id)
    .populate('programId', 'title')
    .populate('studentIds', memberFields);
  if (!b) return res.status(404).json({ error: 'Batch not found.' });
  res.json({ batch: b });
});

// POST /api/skeo/batches — admin creates a batch under a program.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { programId, name, startDate, endDate, status } = req.body || {};
  if (!programId || !name) return res.status(400).json({ error: 'programId and name are required.' });
  const batch = await Batch.create({ programId, name, startDate: startDate || null, endDate: endDate || null, status: status || 'upcoming' });
  res.status(201).json({ batch });
});

// PATCH /api/skeo/batches/:id — admin edits name/dates/status.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ name, startDate, endDate, status }) => ({ name, startDate, endDate, status }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const batch = await Batch.findByIdAndUpdate(req.params.id, allowed, { new: true });
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  res.json({ batch });
});

// DELETE /api/skeo/batches/:id — admin.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await Batch.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// POST /api/skeo/batches/:id/students { email, fullName } — admin enrols a student.
// If no account exists for that email (e.g. someone who paid on the website),
// one is created automatically with a temp password + forced first-login change.
router.post('/:id/students', requireAuth, requireRole('admin'), async (req, res) => {
  const { fullName } = req.body || {};
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  let user = await User.findOne({ email });
  let tempPassword;
  if (!user) {
    tempPassword = crypto.randomBytes(6).toString('hex');
    user = await User.create({ email, fullName: fullName || '', role: 'student', passwordHash: await hashPassword(tempPassword), mustChangePassword: true });
  } else if (user.role !== 'student') {
    return res.status(400).json({ error: 'That email belongs to a non-student account.' });
  }
  await Batch.findByIdAndUpdate(req.params.id, { $addToSet: { studentIds: user._id } });
  await User.findByIdAndUpdate(user._id, { $addToSet: { batchIds: req.params.id } });
  res.json({ ok: true, user: user.toPublic(), created: !!tempPassword, tempPassword });
});

// DELETE /api/skeo/batches/:id/members/:userId — admin unenrols a student.
router.delete('/:id/members/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  const { id, userId } = req.params;
  await Batch.findByIdAndUpdate(id, { $pull$pull: { studentIds: userId } });
  await User.findByIdAndUpdate(userId, { $pull: { batchIds: id } });
  res.json({ ok: true });
});

export default router;

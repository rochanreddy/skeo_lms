import { Router } from 'express';
import crypto from 'crypto';
import { hashPassword } from '../utils/password.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';
import { canAccessBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/skeo/batches — role-scoped: admin=all, student=their own batches.
router.get('/', requireAuth, async (req, res) => {
  const ids = await myBatchIds(req.user);
  // Projected and lean. Only the roster's LENGTH is wanted, so $size it in the
  // database: this used to ship every batch's full studentIds array to the
  // server process -- the single biggest field on the document -- hydrate it
  // into a Mongoose array of ObjectIds, and then read .length off it. On a
  // cohort of 300 that is 300 ids over the wire per batch, per page load, to
  // produce one integer.
  const batches = await Batch.aggregate([
    { $match: { _id: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        name: 1, status: 1, startDate: 1, endDate: 1, programId: 1,
        studentCount: { $size: { $ifNull: ['$studentIds', []] } },
      },
    },
  ]);
  // The programme titles, in one query rather than a populate per batch. There
  // are a handful of programmes and they are looked up by _id, so this is
  // cheaper than teaching the pipeline above about another collection.
  const titles = new Map(
    (await Program.find({ _id: { $in: batches.map((b) => b.programId).filter(Boolean) } })
      .select('title')
      .lean()).map((p) => [String(p._id), p.title]),
  );
  res.json({
    batches: batches.map((b) => ({
      id: b._id, name: b.name, status: b.status,
      program: titles.get(String(b.programId)) || '', programId: b.programId,
      startDate: b.startDate, endDate: b.endDate,
      studentCount: b.studentCount,
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
    .populate('studentIds', memberFields)
    .lean();
  if (!b) return res.status(404).json({ error: 'Batch not found.' });
  res.json({ batch: b });
});

// POST /api/skeo/batches — admin creates a batch under a program.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { programId, name, startDate, endDate, status } = req.body || {};
  if (!programId || !name) return res.status(400).json({ error: 'programId and name are required.' });
  // Everyone who bought Everything AI owns every batch, including this one —
  // the plan is "unlocks all batches", not "the batches that existed the day
  // you paid". So they are in it from the moment it exists.
  const studentIds = await User.distinct('_id', { allAccess: true, role: 'student' });
  const batch = await Batch.create({ programId, name, startDate: startDate || null, endDate: endDate || null, status: status || 'upcoming', studentIds });
  if (studentIds.length) await User.updateMany({ _id: { $in: studentIds } }, { $addToSet: { batchIds: batch._id } });
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
  await Batch.findByIdAndUpdate(id, { $pull: { studentIds: userId } });
  await User.findByIdAndUpdate(userId, { $pull: { batchIds: id } });
  res.json({ ok: true });
});

export default router;

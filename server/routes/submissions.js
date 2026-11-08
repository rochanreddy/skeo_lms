import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { canAccessBatch, canManageBatch, isBlockedFromAssignment } from '../utils/access.js';
import { notify } from '../utils/notify.js';
import { verifyDriveFolder } from '../utils/driveVerify.js';

const router = Router();

// There are no deadlines: a student can hand work in, change it or withdraw
// it at any time. Only an admin's own grade locks a submission.

async function runCheck(sub, assignment) {
  const result = await verifyDriveFolder(sub.driveLink, { requiredTypes: assignment?.requiredDriveTypes });
  sub.checkStatus = result.status;
  sub.errorDetail = result.errorDetail;
  sub.files = result.status === 'READY' ? result.files : [];
  sub.checkedAt = new Date();
  await sub.save();

  if (result.status === 'NEEDS_FIXES') {
    notify(sub.studentId, { type: 'assignment', text: `Your submission for "${assignment?.title || 'your assignment'}" needs fixes: ${result.errorDetail}`, link: '/app/learning' });
  } else if (result.status === 'READY') {
    notify(sub.studentId, { type: 'assignment', text: `Your submission for "${assignment?.title || 'your assignment'}" was received and is in the review queue.`, link: '/app/learning' });
  }
  // CHECK_FAILED is a system fault, not the student's, no student notification.
  // Admins see it directly via checkStatus in the list/detail views instead.
  return sub;
}

// POST /api/skeo/submissions  { assignmentId, driveLink }, student creates/re-submits
// a Drive-folder submission and it's verified synchronously.
router.post('/', requireAuth, async (req, res) => {
  const { assignmentId, driveLink } = req.body || {};
  if (!assignmentId || !driveLink) return res.status(400).json({ error: 'assignmentId and driveLink are required.' });

  const a = await Assignment.findById(assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (isBlockedFromAssignment(req.user, a._id)) return res.status(403).json({ error: 'This item has been blocked for your account.' });
  if (!(await canAccessBatch(req.user, a.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });

  // Only `locked` is read off it, so only `locked` is fetched.
  const existing = await Submission.findOne({ assignmentId: a._id, studentId: req.user._id }).select('locked').lean();
  if (existing?.locked) return res.status(403).json({ error: 'This submission has been reviewed and is locked. Ask your administrator to unlock it before resubmitting.' });

  const sub = await Submission.findOneAndUpdate(
    { assignmentId: a._id, studentId: req.user._id },
    { $set: { driveLink, isDeleted: false, checkStatus: 'PENDING_CHECK', errorDetail: null, status: 'submitted', locked: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await runCheck(sub, a);
  res.status(201).json({ submission: sub });
});

// GET /api/skeo/submissions/assignment/:assignmentId, admin lists submissions
// for one assignment (used by the existing grading UI).
router.get('/assignment/:assignmentId', requireAuth, async (req, res) => {
  const a = await Assignment.findById(req.params.assignmentId).select('_id').lean();
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const submissions = await Submission.find({ assignmentId: a._id, isDeleted: false }).populate('studentId', 'fullName email').lean();
  res.json({ submissions });
});

// GET /api/skeo/submissions: admin list across every batch, filterable
// by assignmentId/status (checkStatus).
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { assignmentId, status } = req.query;
  const q = { isDeleted: false };
  if (assignmentId) q.assignmentId = assignmentId;
  if (status) q.checkStatus = status;

  const submissions = await Submission.find(q)
    .populate('assignmentId', 'title type batchId')
    .populate('studentId', 'fullName email')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ submissions });
});

// GET /api/skeo/submissions/:id, admin detail view.
router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false })
    .populate('assignmentId', 'title type batchId')
    .populate('studentId', 'fullName email')
    .lean();
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  res.json({ submission: sub });
});

// PATCH /api/skeo/submissions/:id  { driveLink?, assignmentId? }, student edits
// their own submission (own, un-locked). Resets checkStatus
// and re-verifies: never leaves stale error text on a changed link.
router.patch('/:id', requireAuth, async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, studentId: req.user._id, isDeleted: false }).populate('assignmentId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (sub.locked) return res.status(403).json({ error: 'This submission has been reviewed and is locked. Ask your administrator to unlock it before making changes.' });

  const { driveLink, assignmentId } = req.body || {};
  let assignment = sub.assignmentId;

  if (assignmentId && String(assignmentId) !== String(assignment._id)) {
    const newAssignment = await Assignment.findById(assignmentId);
    if (!newAssignment) return res.status(404).json({ error: 'Assignment not found.' });
    if (!(await canAccessBatch(req.user, newAssignment.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });
    // Another existence question, so exists() rather than a whole document.
    if (await Submission.exists({ assignmentId: newAssignment._id, studentId: req.user._id, isDeleted: false })) {
      return res.status(409).json({ error: 'You already have a submission for that assignment.' });
    }
    sub.assignmentId = newAssignment._id;
    assignment = newAssignment;
  }

  if (driveLink) sub.driveLink = driveLink;
  sub.checkStatus = 'PENDING_CHECK';
  sub.errorDetail = null;
  sub.status = 'submitted';
  await sub.save();

  await runCheck(sub, assignment);
  res.json({ submission: sub });
});

// DELETE /api/skeo/submissions/:id, student soft-deletes their own submission.
router.delete('/:id', requireAuth, async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, studentId: req.user._id, isDeleted: false });
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (sub.locked) return res.status(403).json({ error: 'This submission has been reviewed and is locked. Ask your administrator to unlock it before deleting.' });
  sub.isDeleted = true;
  await sub.save();
  res.json({ ok: true });
});

// PATCH /api/skeo/submissions/:id/grade  { score, feedback }, admin grades,
// and locks the submission against further student edits.
router.patch('/:id/grade', requireAuth, async (req, res) => {
  const sub = await Submission.findById(req.params.id).populate('assignmentId', 'batchId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  const { score, feedback } = req.body || {};
  sub.score = score === undefined || score === null || score === '' ? null : Number(score);
  sub.feedback = feedback || '';
  sub.status = 'graded';
  sub.locked = true;
  await sub.save();
  notify(sub.studentId, { type: 'grade', text: `Your submission was graded${sub.score != null ? `: ${sub.score}` : ''}.`, link: '/app/learning' });
  res.json({ submission: sub });
});

// POST /api/skeo/submissions/:id/recheck, admin manually re-runs Drive
// verification (after CHECK_FAILED, or the student says permissions are fixed).
router.post('/:id/recheck', requireAuth, requireRole('admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false }).populate('assignmentId', 'title batchId requiredDriveTypes');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  if (!sub.driveLink) return res.status(400).json({ error: 'This submission has no Drive link to check.' });

  await runCheck(sub, sub.assignmentId);
  res.json({ submission: sub });
});

// POST /api/skeo/submissions/:id/unlock, admin lifts the post-grade edit
// lock so the student can resubmit (grade/status are left as-is).
router.post('/:id/unlock', requireAuth, requireRole('admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false }).populate('assignmentId', 'batchId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  sub.locked = false;
  await sub.save();
  res.json({ submission: sub });
});

export default router;

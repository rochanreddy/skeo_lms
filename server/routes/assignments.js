import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Batch } from '../models/Batch.js';
import { canAccessBatch, canManageBatch, myBatchIds, isBlockedFromAssignment } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

// GET /api/skeo/assignments?batchId=..  OR  ?scope=mine
// With scope=mine, each assignment carries the requesting student's submission
// (so the UI can show "due" vs "submitted" vs "graded").
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  let assignments = await Assignment.find(filter).populate('batchId', 'name').sort({ createdAt: -1 });
  // Admin-blocked assignments/projects simply don't exist for this user.
  assignments = assignments.filter((a) => !isBlockedFromAssignment(req.user, a._id));

  if (scope === 'mine') {
    const subs = await Submission.find({ studentId: req.user._id, isDeleted: false, assignmentId: { $in: assignments.map((a) => a._id) } });
    const byId = new Map(subs.map((s) => [s.assignmentId.toString(), s]));
    return res.json({ assignments: assignments.map((a) => ({ ...a.toObject(), mySubmission: byId.get(a._id.toString()) || null })) });
  }
  res.json({ assignments });
});

// POST /api/skeo/assignments — admin sets an assignment/project.
router.post('/', requireAuth, async (req, res) => {
  const { batchId, type, title, description, videoUrl, pdfUrl, startDate, dueDate, requiredDriveTypes } = req.body || {};
  if (!batchId || !title) return res.status(400).json({ error: 'batchId and title are required.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
    return res.status(400).json({ error: 'The start date must be before the last date for submission.' });
  }

  const ALLOWED_TYPES = ['doc', 'slides', 'html'];
  const required = Array.isArray(requiredDriveTypes)
    ? [...new Set(requiredDriveTypes.filter((t) => ALLOWED_TYPES.includes(t)))]
    : undefined; // undefined → fall back to the schema default

  const assignment = await Assignment.create({
    batchId,
    type: type === 'project' ? 'project' : 'assignment',
    title,
    description: description || '',
    videoUrl: videoUrl || '',
    pdfUrl: pdfUrl || '',
    startDate: startDate || null,
    dueDate: dueDate || null,
    ...(required ? { requiredDriveTypes: required } : {}),
  });
  const batch = await Batch.findById(batchId).select('studentIds');
  notifyMany(batch?.studentIds || [], { type: 'assignment', text: `New ${assignment.type}: ${title}`, link: '/app/learning' });
  res.status(201).json({ assignment });
});

// PATCH /api/skeo/assignments/:id — admin edits an assignment/project.
// Same validation as create; only the fields actually sent are touched.
router.patch('/:id', requireAuth, async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });

  const { type, title, description, videoUrl, pdfUrl, startDate, dueDate, requiredDriveTypes } = req.body || {};
  if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });

  // Validate against the dates as they WILL be, not just the ones sent, so an
  // edit that moves only one end still can't invert the window.
  const nextStart = startDate !== undefined ? startDate : assignment.startDate;
  const nextDue = dueDate !== undefined ? dueDate : assignment.dueDate;
  if (nextStart && nextDue && new Date(nextStart) > new Date(nextDue)) {
    return res.status(400).json({ error: 'The start date must be before the last date for submission.' });
  }

  const ALLOWED_TYPES = ['doc', 'slides', 'html'];
  if (title !== undefined) assignment.title = String(title).trim();
  if (type !== undefined) assignment.type = type === 'project' ? 'project' : 'assignment';
  if (description !== undefined) assignment.description = description || '';
  if (videoUrl !== undefined) assignment.videoUrl = videoUrl || '';
  if (pdfUrl !== undefined) assignment.pdfUrl = pdfUrl || '';
  if (startDate !== undefined) assignment.startDate = startDate || null;
  if (dueDate !== undefined) assignment.dueDate = dueDate || null;
  if (Array.isArray(requiredDriveTypes)) {
    assignment.requiredDriveTypes = [...new Set(requiredDriveTypes.filter((t) => ALLOWED_TYPES.includes(t)))];
  }
  await assignment.save();
  res.json({ assignment });
});

// DELETE /api/skeo/assignments/:id — admin removes it, and every submission
// under it (they'd be orphaned and unreachable otherwise).
router.delete('/:id', requireAuth, async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (!canManageBatch(req.user)) return res.status(403).json({ error: 'Forbidden.' });
  await Submission.deleteMany({ assignmentId: assignment._id });
  await assignment.deleteOne();
  res.json({ ok: true });
});

// GET /api/skeo/assignments/:id
router.get('/:id', requireAuth, async (req, res) => {
  const a = await Assignment.findById(req.params.id).populate('batchId', 'name');
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (isBlockedFromAssignment(req.user, a._id)) return res.status(403).json({ error: 'This item has been blocked for your account.' });
  if (!(await canAccessBatch(req.user, a.batchId._id || a.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  res.json({ assignment: a });
});

export default router;

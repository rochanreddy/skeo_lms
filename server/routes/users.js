import { Router } from 'express';
import crypto from 'crypto';
import { hashPassword } from '../utils/password.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { User, ROLES } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Progress } from '../models/Progress.js';
import { Program } from '../models/Program.js';

const router = Router();

// GET /api/skeo/users?role=student&search=foo — admin lists/searches users.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const q = {};
  if (req.query.role) q.role = req.query.role;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).trim(), 'i');
    q.$or = [{ email: rx }, { fullName: rx }];
  }
  const users = await User.find(q).sort({ createdAt: -1 }).limit(200);
  res.json({ users: users.map((u) => u.toPublic()) });
});

// POST /api/skeo/users — admin provisions a student (or another admin). Returns a
// generated temp password if none was supplied (so admin can share it).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, fullName, phone, role = 'student', password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const clean = String(email).toLowerCase().trim();
  if (await User.findOne({ email: clean })) return res.status(409).json({ error: 'That email already exists.' });

  // Admin may set a custom password; otherwise a temp one is generated. Either
  // way the user must change it on first login.
  const temp = password || crypto.randomBytes(6).toString('hex');
  const user = await User.create({
    email: clean,
    fullName: fullName || '',
    phone: phone || '',
    role,
    passwordHash: await hashPassword(temp),
    mustChangePassword: true,
  });
  res.status(201).json({ user: user.toPublic(), tempPassword: temp, custom: !!password });
});

// POST /api/skeo/users/:id/reset-password — admin resets a user's password and
// gets a fresh temp password to hand back (e.g. a student who lost theirs).
router.post('/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { password } = req.body || {};
  const temp = password || crypto.randomBytes(6).toString('hex');
  user.passwordHash = await hashPassword(temp);
  user.resetTokenHash = '';
  user.resetExpires = null;
  user.mustChangePassword = true; // force a fresh password on next login
  await user.save();
  res.json({ ok: true, tempPassword: temp, custom: !!password });
});

// GET /api/skeo/users/:id/overview — deep-dive into one user: everything about
// where they are in their courses. For students: batches, every
// assignment (with submission state), quiz attempts, lesson progress, modules.
router.get('/:id/overview', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const uid = user._id;

  const batches = await Batch.find({ studentIds: uid })
    .populate('programId', 'title modules')
    .sort({ createdAt: -1 });
  const batchIds = batches.map((b) => b._id);

  const [assignments, submissions, quizzes, attempts, progress] = await Promise.all([
    Assignment.find({ batchId: { $in: batchIds } }).sort({ createdAt: -1 }),
    Submission.find({ studentId: uid, isDeleted: false })
      .select('assignmentId status score feedback updatedAt driveLink url checkStatus errorDetail files locked checkedAt'),
    Quiz.find({ batchId: { $in: batchIds } }).select('title type batchId'),
    QuizAttempt.find({ studentId: uid }).select('quizId score total createdAt'),
    Progress.find({ studentId: uid }).select('programId completedTopics'),
  ]);

  const subByAssignment = new Map(submissions.map((s) => [String(s.assignmentId), s]));
  const batchName = new Map(batches.map((b) => [String(b._id), b.name]));
  const quizById = new Map(quizzes.map((q) => [String(q._id), q]));
  const blockedAssignments = new Set((user.blocked?.assignmentIds || []).map(String));
  const blockedBatches = new Set((user.blocked?.batchIds || []).map(String));

  const lessonTotal = (p) =>
    (p?.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);

  const out = {
    user: user.toPublic(),
    batches: batches.map((b) => {
      return {
        id: b._id,
        name: b.name,
        status: b.status,
        program: b.programId?.title || '',
        studentCount: (b.studentIds || []).length,
        blocked: blockedBatches.has(String(b._id)),
      };
    }),
    assignments: user.role === 'student'
      ? assignments.map((a) => {
          const s = subByAssignment.get(String(a._id));
          return {
            id: a._id,
            title: a.title,
            type: a.type,
            batchId: a.batchId,
            batchName: batchName.get(String(a.batchId)) || '',
            dueDate: a.dueDate,
            // Grading fields and Drive-verification fields are kept as separate
            // groups here on purpose — they answer different questions and a
            // later automated-review layer gets its own group again.
            submission: s
              ? {
                  id: s._id,
                  status: s.status,
                  score: s.score,
                  feedback: s.feedback,
                  at: s.updatedAt,
                  locked: s.locked,
                  driveLink: s.driveLink || s.url || '',
                  checkStatus: s.checkStatus,
                  errorDetail: s.errorDetail,
                  files: s.files || [],
                  checkedAt: s.checkedAt,
                }
              : null,
            blocked: blockedAssignments.has(String(a._id)),
          };
        })
      : [],
    quizAttempts: attempts
      .filter((a) => quizById.has(String(a.quizId)))
      .map((a) => {
        const q = quizById.get(String(a.quizId));
        return {
          id: a._id,
          quiz: q.title,
          type: q.type,
          batchName: batchName.get(String(q.batchId)) || '',
          score: a.score,
          total: a.total,
          at: a.createdAt,
        };
      }),
    progress: progress.map((p) => {
      const b = batches.find((x) => String(x.programId?._id) === String(p.programId));
      const total = lessonTotal(b?.programId);
      const done = (p.completedTopics || []).length;
      return {
        programId: p.programId,
        title: b?.programId?.title || 'Program',
        done,
        total,
        pct: total ? Math.round((Math.min(done, total) / total) * 100) : null,
      };
    }),
  };

  // Every curriculum module across the student's programs, with block state —
  // drives the admin's per-module block toggles.
  if (user.role === 'student') {
    const blockedModules = new Set((user.blocked?.moduleIds || []).map(String));
    const seenPrograms = new Set();
    out.modules = [];
    for (const b of batches) {
      const prog = b.programId;
      if (!prog?._id || seenPrograms.has(String(prog._id))) continue;
      seenPrograms.add(String(prog._id));
      for (const m of prog.modules || []) {
        out.modules.push({
          id: m._id,
          title: m.title,
          program: prog.title,
          lessons: (m.chapters || []).reduce((n, c) => n + (c.topics || []).length, 0),
          blocked: blockedModules.has(String(m._id)),
        });
      }
    }
  }

  res.json(out);
});

// PATCH /api/skeo/users/:id/blocks — admin block/unblock controls. Accepts any
// subset of { lms, batchIds, assignmentIds, reason }; whatever is present is
// applied. Admin accounts can never be blocked.
router.patch('/:id/blocks', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be blocked.' });

  const { lms, batchIds, moduleIds, assignmentIds, reason } = req.body || {};
  const blocked = user.blocked || {};
  if (lms !== undefined) blocked.lms = !!lms;
  if (Array.isArray(batchIds)) blocked.batchIds = batchIds;
  if (Array.isArray(moduleIds)) blocked.moduleIds = moduleIds;
  if (Array.isArray(assignmentIds)) blocked.assignmentIds = assignmentIds;
  if (reason !== undefined) blocked.reason = String(reason || '');
  blocked.at = new Date();
  user.blocked = blocked;
  user.markModified('blocked');
  await user.save();
  res.json({ ok: true, user: user.toPublic() });
});

// PATCH /api/skeo/users/:id — admin edits a user's profile (name/phone/email).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { fullName, phone, email } = req.body || {};
  if (email !== undefined) {
    const clean = String(email).toLowerCase().trim();
    if (!clean) return res.status(400).json({ error: 'Email cannot be empty.' });
    const dupe = await User.findOne({ email: clean, _id: { $ne: user._id } });
    if (dupe) return res.status(409).json({ error: 'That email already exists.' });
    user.email = clean;
  }
  if (fullName !== undefined) user.fullName = String(fullName);
  if (phone !== undefined) user.phone = String(phone);
  await user.save();
  res.json({ ok: true, user: user.toPublic() });
});

export default router;

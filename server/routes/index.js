import { Router } from 'express';

import authRoutes from './auth.js';
import meRoutes from './me.js';
import programRoutes from './programs.js';
import userRoutes from './users.js';
import batchRoutes from './batches.js';
import sessionRoutes from './sessions.js';
import assignmentRoutes from './assignments.js';
import submissionRoutes from './submissions.js';
import quizRoutes from './quizzes.js';
import forumRoutes from './forum.js';
import libraryRoutes from './library.js';
import webinarRoutes from './webinars.js';
import statsRoutes from './stats.js';
import uploadRoutes from './uploads.js';
import progressRoutes from './progress.js';
import notificationRoutes from './notifications.js';
import announcementRoutes from './announcements.js';
import gradeRoutes from './grades.js';
import searchRoutes from './search.js';
import reportRoutes from './reports.js';

const router = Router();

router.get('/', (_req, res) => res.json({ ok: true, service: 'menler-lms', version: 2 }));

// Phase 1
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/programs', programRoutes);

// Phase 2
router.use('/users', userRoutes);
router.use('/batches', batchRoutes);
router.use('/sessions', sessionRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/submissions', submissionRoutes);
router.use('/quizzes', quizRoutes);
router.use('/forum', forumRoutes);
router.use('/library', libraryRoutes);
router.use('/webinars', webinarRoutes);
router.use('/stats', statsRoutes);
router.use('/uploads', uploadRoutes);
router.use('/progress', progressRoutes);
router.use('/notifications', notificationRoutes);
router.use('/announcements', announcementRoutes);
router.use('/grades', gradeRoutes);
router.use('/search', searchRoutes); // universal ⌘K search across everything you can see
router.use('/reports', reportRoutes); // admin CSV exports

export default router;

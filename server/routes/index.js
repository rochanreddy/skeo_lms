import { Router } from 'express';

import authRoutes from './auth.js';
import meRoutes from './me.js';
import programRoutes from './programs.js';
import userRoutes from './users.js';
import batchRoutes from './batches.js';
import assignmentRoutes from './assignments.js';
import submissionRoutes from './submissions.js';
import quizRoutes from './quizzes.js';
import libraryRoutes from './library.js';
import jobRoutes from './jobs.js';
import statsRoutes from './stats.js';
import progressRoutes from './progress.js';
import notificationRoutes from './notifications.js';
import announcementRoutes from './announcements.js';
import gradeRoutes from './grades.js';
import searchRoutes from './search.js';
import reportRoutes from './reports.js';
import videoRoutes from './videos.js';

const router = Router();

router.get('/', (_req, res) => res.json({ ok: true, service: 'skeo-lms', version: 2 }));

// Phase 1
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/programs', programRoutes);

// Phase 2
router.use('/users', userRoutes);
router.use('/batches', batchRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/submissions', submissionRoutes);
router.use('/quizzes', quizRoutes);
router.use('/library', libraryRoutes);
router.use('/jobs', jobRoutes);
router.use('/stats', statsRoutes);
router.use('/progress', progressRoutes);
router.use('/notifications', notificationRoutes);
router.use('/announcements', announcementRoutes);
router.use('/grades', gradeRoutes);
router.use('/search', searchRoutes); // universal ⌘K search across everything you can see
router.use('/reports', reportRoutes); // admin CSV exports
router.use('/videos', videoRoutes); // VdoCipher: per-viewer playback OTPs + admin library

export default router;

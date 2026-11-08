// AI grading: Gemini reads a submission's Drive folder and scores it against
// the assignment's rubric (config/rubrics.js). The grade goes straight to the
// student; admins do not review it first, though they can override it.
//
// Flow: a folder passes the Drive check (routes/submissions.js) -> requestReview()
// marks it pending and queues it -> review() reads the files, asks Gemini,
// and writes the score, feedback and per-criterion breakdown.
//
// Safe against the races that matter:
//   - The student resubmits while a review runs: the write is conditional on
//     the folder version it read (checkedAt), so a stale grade is dropped and
//     the new version is reviewed on its own.
//   - An admin grades by hand meanwhile: an admin grade is never overwritten.
//   - The server restarts mid-queue (the queue is in memory): the sweep finds
//     work left pending or failed and queues it again, a few tries at most.
import { Submission } from '../models/Submission.js';
import { GRADING_GUIDE, rubricFor } from '../config/rubrics.js';
import { readDriveFiles } from './driveContent.js';
import { generateJson, geminiConfigured } from './gemini.js';
import { notify } from './notify.js';

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 2;
const SWEEP_EVERY_MS = 15 * 60 * 1000;
const STUCK_AFTER_MS = 15 * 60 * 1000;

/** On whenever a Gemini key is set, unless AI_GRADING=off. */
export const aiGradingOn = () => geminiConfigured() && process.env.AI_GRADING !== 'off';

// ── Queue ──────────────────────────────────────────────────────────────────
const waiting = [];
const inQueue = new Set(); // waiting or running
const again = new Set(); // asked for again while running
let running = 0;

function enqueue(id) {
  const key = String(id);
  if (inQueue.has(key)) { again.add(key); return; }
  inQueue.add(key);
  waiting.push(key);
  pump();
}

function pump() {
  while (running < CONCURRENCY && waiting.length) {
    const id = waiting.shift();
    running += 1;
    review(id)
      .catch((err) => console.error(`[ai-grade] ${id}: ${err.message}`))
      .finally(() => {
        running -= 1;
        inQueue.delete(id);
        if (again.delete(id)) enqueue(id);
        pump();
      });
  }
}

/**
 * Marks a submission's review pending and queues it. Call after the folder
 * passed the Drive check; `sub` is a Mongoose document (saved here).
 */
export async function requestReview(sub) {
  if (!aiGradingOn() || sub.checkStatus !== 'READY' || sub.gradedBy === 'admin') return false;
  sub.aiReview = { status: 'pending', queuedAt: new Date(), attempts: 0 };
  await sub.save();
  enqueue(sub._id);
  return true;
}

// ── One review ─────────────────────────────────────────────────────────────
function responseSchema(rubric) {
  return {
    type: 'OBJECT',
    properties: {
      criteria: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', enum: rubric.criteria.map((c) => c.id) },
            score: { type: 'INTEGER' },
            note: { type: 'STRING' },
          },
          required: ['id', 'score', 'note'],
          propertyOrdering: ['id', 'score', 'note'],
        },
      },
      feedback: { type: 'STRING' },
    },
    required: ['criteria', 'feedback'],
    // Scores first, so the feedback is written to agree with them.
    propertyOrdering: ['criteria', 'feedback'],
  };
}

function briefing(assignment, rubric, manifest) {
  return [
    'Grade this submission.',
    '',
    `ASSIGNMENT: ${assignment.title} (${assignment.type === 'project' ? 'project' : 'assignment'})`,
    'BRIEF:',
    assignment.description || '(no written brief)',
    '',
    `RUBRIC: ${rubric.name}. Score every criterion with a whole number from 0 to its maximum; the maximums add up to 10.`,
    ...rubric.criteria.map((c) => `- ${c.id} · ${c.name} (0–${c.max}): ${c.guide}`),
    '',
    'For each criterion, "note" is one short sentence to the student on why it got that score.',
    '',
    "FILES IN THE STUDENT'S FOLDER:",
    ...manifest.map((m) => `- ${m.name}: ${m.read}`),
    '',
    'The files follow.',
  ].join('\n');
}

const clampText = (s, n) => String(s || '').replace(/\s+\n/g, '\n').trim().slice(0, n);

// Holds the model to the rubric: every criterion present, every score a whole
// number within range. A malformed answer throws, which counts as a failed
// attempt and is retried, rather than half a grade reaching a student.
function normalise(data, rubric) {
  const given = new Map((Array.isArray(data?.criteria) ? data.criteria : []).map((c) => [c?.id, c]));
  const criteria = rubric.criteria.map((c) => {
    const g = given.get(c.id);
    if (!g || !Number.isFinite(Number(g.score))) throw new Error(`the answer left out "${c.name}"`);
    return {
      id: c.id,
      name: c.name,
      max: c.max,
      score: Math.max(0, Math.min(c.max, Math.round(Number(g.score)))),
      note: clampText(g.note, 300),
    };
  });
  const feedback = clampText(data?.feedback, 1200);
  if (!feedback) throw new Error('the answer had no feedback');
  return { criteria, feedback, score: criteria.reduce((s, c) => s + c.score, 0) };
}

/**
 * gradeWork(assignment, { parts, manifest }) -> { score, criteria, feedback, rubric, model }
 * The grading itself, given files already read (see readDriveFiles).
 */
export async function gradeWork(assignment, { parts, manifest }) {
  const rubric = rubricFor(assignment);
  const { data, model } = await generateJson({
    system: GRADING_GUIDE,
    parts: [
      { text: briefing(assignment, rubric, manifest) },
      ...parts,
      { text: 'That is everything in the folder. Score each criterion, then write the feedback.' },
    ],
    schema: responseSchema(rubric),
  });
  return { ...normalise(data, rubric), rubric: rubric.name, model };
}

async function review(id) {
  const sub = await Submission.findById(id).populate('assignmentId', 'title type description');
  if (!sub || sub.isDeleted || sub.checkStatus !== 'READY' || sub.gradedBy === 'admin' || !sub.assignmentId) return;

  const assignment = sub.assignmentId;
  const version = sub.checkedAt; // the folder as it was when this review read it
  const previous = sub.aiReview?.toObject?.() || sub.aiReview || {};
  // Only the version this review read, and never over an admin's grade.
  const filter = { _id: sub._id, checkedAt: version, isDeleted: false, gradedBy: { $ne: 'admin' } };

  let manifest = [];
  try {
    const files = await readDriveFiles(sub.files);
    manifest = files.manifest;
    if (!files.readable) throw new Error('none of the files in the folder could be opened');
    const result = await gradeWork(assignment, files);

    const saved = await Submission.findOneAndUpdate(filter, {
      $set: {
        score: result.score,
        feedback: result.feedback,
        status: 'graded',
        gradedBy: 'ai',
        aiReview: {
          status: 'done',
          score: result.score,
          rubric: result.rubric,
          criteria: result.criteria,
          feedback: result.feedback,
          files: manifest,
          model: result.model,
          error: '',
          attempts: previous.attempts || 0,
          queuedAt: previous.queuedAt || null,
          reviewedAt: new Date(),
        },
      },
    }, { new: true });

    if (saved) {
      const noun = assignment.type === 'project' ? 'project' : 'assignment';
      notify(sub.studentId, {
        type: 'grade',
        text: `Your ${noun} "${assignment.title}" has been graded: ${result.score}/10. Open it to see the feedback.`,
        link: '/app/learning?tab=assignments',
      });
    }
  } catch (err) {
    console.error(`[ai-grade] ${id} (${assignment.title}): ${err.message}`);
    await Submission.updateOne(filter, {
      $set: {
        aiReview: {
          status: 'failed',
          error: clampText(err.message, 500),
          files: manifest,
          attempts: (previous.attempts || 0) + 1,
          queuedAt: previous.queuedAt || null,
        },
      },
    });
  }
}

// ── Sweep ──────────────────────────────────────────────────────────────────
// Picks up work the in-memory queue lost or could not finish: folders that
// passed the check but were never queued (submitted before AI grading was
// switched on), reviews stuck pending across a restart, and failed reviews
// with tries left.
export async function sweep() {
  if (!aiGradingOn()) return 0;
  const stuck = new Date(Date.now() - STUCK_AFTER_MS);
  const subs = await Submission.find({
    isDeleted: false,
    checkStatus: 'READY',
    status: 'submitted',
    gradedBy: { $ne: 'admin' },
    $or: [
      { aiReview: null },
      { 'aiReview.status': 'failed', 'aiReview.attempts': { $lt: MAX_ATTEMPTS } },
      { 'aiReview.status': 'pending', 'aiReview.queuedAt': { $lt: stuck } },
    ],
  }).select('_id aiReview').limit(100).lean();

  for (const s of subs) {
    if (!s.aiReview) {
      await Submission.updateOne({ _id: s._id, aiReview: null }, { $set: { aiReview: { status: 'pending', queuedAt: new Date(), attempts: 0 } } });
    } else if (s.aiReview.status === 'pending') {
      await Submission.updateOne({ _id: s._id }, { $set: { 'aiReview.queuedAt': new Date() } });
    }
    enqueue(s._id);
  }
  if (subs.length) console.log(`[ai-grade] sweep queued ${subs.length} submission(s)`);
  return subs.length;
}

/** Called once at boot. */
export function startAiGrading() {
  if (!aiGradingOn()) {
    console.log('[ai-grade] off: set GEMINI_API_KEY to grade submissions automatically');
    return;
  }
  const run = () => sweep().catch((err) => console.error('[ai-grade] sweep failed:', err.message));
  setTimeout(run, 20_000).unref();
  setInterval(run, SWEEP_EVERY_MS).unref();
}

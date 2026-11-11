import crypto from 'crypto';
import { Program } from '../models/Program.js';
import { Quiz } from '../models/Quiz.js';
import { Counter } from '../models/Counter.js';
import { QUIZZES } from '../scripts/claudeQuizzes.js';
import { resetQuizAttempts } from './quizReset.js';

/**
 * Bring the Claude programme's eight module gate quizzes in line with
 * scripts/claudeQuizzes.js.
 *
 * Quizzes are matched to modules by position (module 1 gets QUIZZES[0]) and
 * updated in place, never deleted, so students' attempts survive. The first
 * three questions of each quiz never change (see claudeQuizzes.js), so stored
 * answers to them still line up.
 *
 * Run on every server start (index.js), so editing claudeQuizzes.js and
 * deploying is all it takes to change the live quizzes. It applies each
 * version of the file ONCE: a fingerprint of QUIZZES is recorded in
 * skeo_counters, and a start that finds it already there does nothing. So an
 * admin's later edit in the app is not reverted on the next restart, only by
 * the next change to claudeQuizzes.js. `npm run seed:quizzes` applies it on
 * demand, fingerprint or not.
 *
 * A quiz whose questions change is reset for everyone (utils/quizReset.js):
 * a score earned on the old questions says nothing about the new ones, so
 * every student sits it again. A retitle alone resets nothing.
 */
export const QUIZ_FINGERPRINT = crypto.createHash('sha1').update(JSON.stringify(QUIZZES)).digest('hex').slice(0, 16);
const marker = `quizsync:claude:${QUIZ_FINGERPRINT}`;

const same = (a, b) => a.length === b.length && a.every((q, i) =>
  q.text === b[i].text
  && q.correctIndex === b[i].correctIndex
  && (q.explanation || '') === (b[i].explanation || '')
  && (q.options || []).join('|') === (b[i].options || []).join('|'));

/**
 * @param {{ write?: boolean, force?: boolean, log?: (line: string) => void }} opts
 *   write: false reports without writing; force: ignore the fingerprint.
 * @returns {Promise<{ skipped?: string, changes: number }>}
 */
export async function syncClaudeQuizzes({ write = true, force = false, log = () => {} } = {}) {
  if (!force && await Counter.exists({ _id: marker })) return { skipped: 'already applied', changes: 0 };

  const program = await Program.findOne({ title: 'Claude' }).select('modules._id').lean();
  if (!program) return { skipped: 'no "Claude" programme', changes: 0 };
  const modules = program.modules || [];
  if (modules.length !== QUIZZES.length) {
    throw new Error(`The programme has ${modules.length} modules but claudeQuizzes.js has ${QUIZZES.length} quizzes. Not guessing which goes where.`);
  }

  let changes = 0;
  for (let i = 0; i < modules.length; i += 1) {
    const moduleId = String(modules[i]._id);
    const [subject, qs] = QUIZZES[i];
    const title = `Module ${i + 1} quiz: ${subject}`;
    const questions = qs.map(({ text, options, correctIndex, explanation }) => ({ text, options, correctIndex, explanation: explanation || '' }));
    const existing = await Quiz.findOne({ programId: program._id, moduleId });
    if (!existing) {
      changes += 1;
      log(`+ create  ${title} (${questions.length} questions)`);
      if (write) await Quiz.create({ programId: program._id, moduleId, title, type: 'quiz', questions });
    } else if (existing.title !== title || !same(existing.questions || [], questions)) {
      const newQuestions = !same(existing.questions || [], questions);
      changes += 1;
      log(`~ update  ${title}: ${(existing.questions || []).length} -> ${questions.length} questions${newQuestions ? ', attempts reset' : ''}`);
      if (write) {
        existing.title = title; existing.questions = questions; await existing.save();
        if (newQuestions) await resetQuizAttempts([existing._id], 'questions replaced');
      }
    }
  }
  if (write) await Counter.updateOne({ _id: marker }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  return { changes };
}

/**
 * One-off: reset every attempt at the Claude module quizzes, once. The
 * questions were replaced on 2026-11-11 before the sync above reset attempts
 * itself, so attempts made on the old questions were still standing. The
 * marker in skeo_counters keeps it from ever running twice.
 *
 * @returns {Promise<{ skipped?: string, reset: number }>}
 */
export async function resetClaudeQuizAttemptsOnce() {
  const once = 'quizreset:claude:2026-11-11';
  if (await Counter.exists({ _id: once })) return { skipped: 'already done', reset: 0 };
  const program = await Program.findOne({ title: 'Claude' }).select('_id').lean();
  if (!program) return { skipped: 'no "Claude" programme', reset: 0 };
  const quizIds = (await Quiz.find({ programId: program._id }).select('_id').lean()).map((q) => q._id);
  const reset = await resetQuizAttempts(quizIds, 'new questions, 2026-11-11');
  await Counter.updateOne({ _id: once }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  return { reset };
}

// Update ONLY the Claude programme's module gate quizzes from claudeQuizzes.js.
//
// seedClaude.js re-authors the whole course (lessons, briefs, programme
// description) and will overwrite anything edited since it last ran. This
// touches nothing but the eight gate quizzes: their title and questions.
//
// Quizzes are matched to modules by position (module 1 gets QUIZZES[0]) and
// updated in place, never deleted, so students' attempts survive. The first
// three questions of each quiz are the original ones, unchanged, so an
// attempt made against a 3-question quiz still lines up with its answers.
//
// Dry run by default: it prints what would change and writes nothing.
//   npm run seed:quizzes            # dry run, report only
//   npm run seed:quizzes -- --write # commit
//
// It writes to whatever MONGODB_URI points at. server/.env is the local
// database; production's URI lives only in Render.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';
import { Quiz } from '../models/Quiz.js';
import { QUIZZES } from './claudeQuizzes.js';

const WRITE = process.argv.includes('--write');

const same = (a, b) => a.length === b.length && a.every((q, i) =>
  q.text === b[i].text
  && q.correctIndex === b[i].correctIndex
  && (q.explanation || '') === (b[i].explanation || '')
  && (q.options || []).join('|') === (b[i].options || []).join('|'));

async function run() {
  await connectDb();
  const host = mongoose.connection.host;
  console.log(`Database: ${host}/${mongoose.connection.name}${WRITE ? '' : '  (dry run)'}`);

  const program = await Program.findOne({ title: 'Claude' }).select('modules._id modules.title').lean();
  if (!program) throw new Error('No "Claude" programme in this database.');
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
      console.log(`+ create  ${title} (${questions.length} questions)`);
      if (WRITE) await Quiz.create({ programId: program._id, moduleId, title, type: 'quiz', questions });
    } else if (existing.title !== title || !same(existing.questions || [], questions)) {
      changes += 1;
      console.log(`~ update  ${title}: ${(existing.questions || []).length} -> ${questions.length} questions`);
      if (WRITE) { existing.title = title; existing.questions = questions; await existing.save(); }
    }
  }

  console.log(changes === 0 ? 'Quizzes already up to date.' : WRITE ? `Wrote ${changes} quiz(zes).` : `Dry run: ${changes} quiz(zes) would change. Re-run with --write to commit.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

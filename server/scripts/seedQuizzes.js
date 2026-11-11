// Update ONLY the Claude programme's module gate quizzes from claudeQuizzes.js.
//
// seedClaude.js re-authors the whole course (lessons, briefs, programme
// description) and will overwrite anything edited since it last ran. This
// touches nothing but the eight gate quizzes: their title and questions.
//
// The server applies the same sync on start (utils/claudeQuizSync.js), once
// per version of claudeQuizzes.js, so a deploy is normally all it takes. This
// script is for applying it on demand: it ignores that once-per-version mark.
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
import { syncClaudeQuizzes } from '../utils/claudeQuizSync.js';

const WRITE = process.argv.includes('--write');

async function run() {
  await connectDb();
  console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}${WRITE ? '' : '  (dry run)'}`);
  const r = await syncClaudeQuizzes({ write: WRITE, force: true, log: (line) => console.log(line) });
  if (r.skipped) console.log(`Skipped: ${r.skipped}.`);
  else console.log(r.changes === 0 ? 'Quizzes already up to date.' : WRITE ? `Wrote ${r.changes} quiz(zes).` : `Dry run: ${r.changes} quiz(zes) would change. Re-run with --write to commit.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

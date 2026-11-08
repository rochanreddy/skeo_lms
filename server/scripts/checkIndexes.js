/* Do the indexes the models ask for actually exist on the cluster?
 *
 *   npm run db:indexes            report
 *   npm run db:indexes -- --fix   build whatever is missing, then report
 *
 * Why this exists. Mongoose builds indexes on connect (autoIndex), which is
 * convenient and silent in both directions: if a build fails -- a conflicting
 * definition, a permission the database user does not have, a rolling deploy
 * that restarted mid-build -- nothing says so, and the app keeps answering,
 * just by reading every document instead of looking one up. The queries that
 * matter most here are the ones that got indexes added for them, so an index
 * quietly absent is the difference between a lookup and a collection scan on
 * the busiest path in the app, with no symptom but slowness.
 *
 * Read-only unless --fix is passed. It never drops anything: an index this
 * does not know about is reported and left alone, because it may belong to a
 * deploy newer than this checkout.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

/* Its own connection, with autoIndex OFF -- deliberately not connectDb().
 *
 * The app connects with autoIndex on, which is what builds these indexes in
 * the first place. If this script connected the same way, merely asking "is
 * the index there?" would quietly create it, the report would always say yes,
 * and the tool would be incapable of finding the thing it exists to find.
 * Off, the report is the truth about the cluster, and --fix below is the only
 * code here that writes anything.
 */
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skeo';

// Importing the models is what registers their index definitions.
import { Announcement } from '../models/Announcement.js';
import { Assignment } from '../models/Assignment.js';
import { Batch } from '../models/Batch.js';
import { Certificate } from '../models/Certificate.js';
import { Counter } from '../models/Counter.js';
import { LibraryItem } from '../models/LibraryItem.js';
import { Notification } from '../models/Notification.js';
import { Program } from '../models/Program.js';
import { Progress } from '../models/Progress.js';
import { ProvisionedOrder } from '../models/ProvisionedOrder.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Submission } from '../models/Submission.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { User } from '../models/User.js';
import { Webinar } from '../models/Webinar.js';

const MODELS = [
  Announcement, Assignment, Batch, Certificate, Counter, LibraryItem,
  Notification, Program, Progress, ProvisionedOrder, PushSubscription,
  Quiz, QuizAttempt, Submission, SupportTicket, User, Webinar,
];

/* The handful whose absence is not "a bit slower" but "reads the whole
 * collection on the hottest path in the app". Called out separately so a
 * missing one cannot be lost in a long list of healthy ones. */
const CRITICAL = [
  ['Batch', '{"studentIds":1}', 'every batch-membership check: myBatchIds, canAccessBatch, hasPaidAccess'],
  ['Submission', '{"studentId":1,"isDeleted":1,"assignmentId":1}', '/assignments?scope=mine, on every student home and Learning load'],
  ['Notification', '{"userId":1,"read":1}', 'the unread badge, asked for by every open tab'],
  ['Assignment', '{"batchId":1,"createdAt":-1}', 'every assignment list'],
  ['QuizAttempt', '{"studentId":1,"quizId":1}', 'the gradebook'],
];

const key = (k) => JSON.stringify(k);

async function main() {
  const fix = process.argv.includes('--fix');
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  console.log(`\ndatabase: ${mongoose.connection.name}${fix ? '   (--fix: will build what is missing)' : '   (read-only)'}\n`);

  const missing = [];
  const extra = [];
  const absent = new Set(); // collections that do not exist yet
  let declared = 0;

  for (const Model of MODELS) {
    const name = Model.modelName;
    const want = new Map(Model.schema.indexes().map(([k]) => [key(k), k]));
    declared += want.size;

    let have;
    try {
      have = await Model.collection.indexes();
    } catch (e) {
      /* No collection means no indexes, and on a database nothing has been
       * written to yet that is correct rather than broken: mongo creates the
       * collection and its indexes together on the first write. Tracked
       * separately from a real miss, which is a collection that exists and is
       * being scanned. */
      absent.add(name);
      console.log(`· ${name.padEnd(15)} no collection yet, nothing to index`);
      continue;
    }
    const haveKeys = new Set(have.map((i) => key(i.key)));

    const gone = [...want.keys()].filter((k) => !haveKeys.has(k));
    // _id_ is implicit and never declared; anything else undeclared is worth a look.
    const unknown = have.filter((i) => key(i.key) !== '{"_id":1}' && !want.has(key(i.key)));

    const mark = gone.length ? '✗' : '✓';
    console.log(`${mark} ${name.padEnd(15)} ${have.length - 1}/${want.size} declared present${gone.length ? `   MISSING: ${gone.join('  ')}` : ''}`);
    for (const i of unknown) extra.push(`${name} ${key(i.key)}${i.name ? ` (${i.name})` : ''}`);
    for (const k of gone) missing.push({ model: name, key: k, spec: want.get(k) });

    if (fix && gone.length) {
      for (const k of gone) {
        const [, opts] = Model.schema.indexes().find(([kk]) => key(kk) === k);
        try {
          await Model.collection.createIndex(want.get(k), opts || {});
          console.log(`    built ${k}`);
        } catch (e) {
          console.log(`    FAILED to build ${k}: ${e.message}`);
        }
      }
    }
  }

  console.log(`\n${declared} indexes declared across ${MODELS.length} models.`);

  if (extra.length) {
    console.log('\nPresent but not declared in this checkout (left alone: may belong to a newer deploy):');
    extra.forEach((e) => console.log(`  · ${e}`));
  }

  // The critical ones get their own verdict, after any --fix has run.
  console.log('\nThe ones whose absence costs a collection scan:');
  let criticalMissing = 0;
  for (const [model, k, why] of CRITICAL) {
    const Model = MODELS.find((m) => m.modelName === model);
    if (absent.has(model)) {
      console.log(`  ·         ${model}.${k}: no collection yet`);
      continue;
    }
    let present = false;
    try {
      present = (await Model.collection.indexes()).some((i) => key(i.key) === k);
    } catch { present = false; }
    if (!present) criticalMissing += 1;
    console.log(`  ${present ? '✓' : '✗ MISSING'}  ${model}.${k}`);
    if (!present) console.log(`             ${why}`);
  }

  if (missing.length) {
    if (fix) {
      console.log(`\n${missing.length} index(es) were missing; see the build results above.`);
    } else {
      console.log(`\n${missing.length} index(es) missing from collections that exist. To build them:`);
      console.log('  npm run db:indexes -- --fix');
    }
  } else if (absent.size === MODELS.length) {
    console.log('\nNothing has been written to this database yet. Run the seeds first.');
  } else if (absent.size) {
    console.log(`\nEverything the models ask for is present. (${absent.size} collection(s) not created yet.)`);
  } else {
    console.log('\nEverything the models ask for is present.');
  }

  await mongoose.disconnect();
  process.exit(criticalMissing ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\ncheckIndexes failed:', e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

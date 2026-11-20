// Link a course's video lessons to the videos in its shared Google Drive
// folder, matched by lesson number (utils/driveLessons.js). The live Claude
// course is linked by itself on server start (linkClaudeDriveVideosOnce);
// this is for re-running it, say after new videos are added to the folder.
//
//   node scripts/linkDriveVideos.js [folder link] [course title]           show what would change
//   node scripts/linkDriveVideos.js [folder link] [course title] --write   link them
//
// Defaults: the Claude course and its folder. Writes to whatever MONGODB_URI
// points at; server/.env is the local database.

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { CLAUDE_DRIVE_FOLDER, linkDriveFolder } from '../utils/driveLessons.js';

async function run() {
  const args = process.argv.slice(2).filter((a) => a !== '--write');
  const write = process.argv.includes('--write');
  await connectDb();
  const r = await linkDriveFolder({ folder: args[0] || CLAUDE_DRIVE_FOLDER, courseTitle: args[1] || 'Claude', write });

  for (const c of r.changes) console.log(`${c.replaced ? '↻' : '+'} ${c.lesson}  ←  ${c.file}`);
  console.log(`\n${r.videos} videos in the folder · ${r.changes.length} to link`);
  if (r.unmatched.length) console.log(`No lesson for: ${r.unmatched.join(', ')}`);
  if (r.bare.length) console.log(`Video lessons with no Drive video: ${r.bare.length} (${r.bare.slice(0, 3).join(', ')}${r.bare.length > 3 ? ', …' : ''})`);
  if (!r.changes.length) console.log('Nothing to change.');
  else console.log(write ? `✓ Linked ${r.changes.length} lessons.` : 'Dry run: add --write to save.');
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(`✗ ${e.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

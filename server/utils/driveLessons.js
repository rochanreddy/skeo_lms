import { Counter } from '../models/Counter.js';
import { Program } from '../models/Program.js';
import { listDriveVideos, parseFolderId } from './driveVideo.js';

// Linking a course's video lessons to the videos in its shared Google Drive
// folder, by lesson number: "4.1 Connectors & MCP.mp4" goes to the lesson
// titled "4.1 · …", "1.9 Module 1 Recap.mp4" to "Module 1 Recap". The same
// matching as the editor's "Read folder" (client/src/components/DriveLinks.jsx).

// The Claude course's videos, a folder of module folders.
export const CLAUDE_DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1dQuyGYNgV4xJXYbJnl9znWVJVFj6aYEl';

// Mirrors client/src/lib/vdoLinks.js lessonNumber().
function lessonNumber(title) {
  const r = /^\s*(?:module\s*|m)0*(\d+)\s*[·:\-–—_]?\s*recap\b/i.exec(String(title || ''));
  if (r) return `${r[1]}.recap`;
  const m = /^\s*(\d+(?:\.\d+)+|\d+)(?=[\s.·:)\-–—_]|$)/.exec(String(title || ''));
  return m ? m[1].replace(/\.$/, '') : null;
}
// Mirrors client/src/lib/drive.js lessonLabel().
function lessonLabel(fileName) {
  const name = String(fileName || '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
  const recap = name.match(/module\s*0*(\d+)\s*recap/i);
  return recap ? `Module ${recap[1]} Recap` : name;
}

/**
 * @param folder       a Drive folder link or id
 * @param courseTitle  the programme to link
 * @param write        save the changes (otherwise only report them)
 * @param onlyEmpty    leave lessons that already have a Drive video alone
 * @returns {{ videos, changes: [{ lesson, file, replaced }], unmatched, bare }}
 */
export async function linkDriveFolder({ folder, courseTitle, write = false, onlyEmpty = false }) {
  const folderId = parseFolderId(folder);
  if (!folderId) throw new Error('That is not a Google Drive folder link.');
  const videos = await listDriveVideos(folderId);
  if (!videos.length) throw new Error('No videos found. Is the folder shared as "Anyone with the link"?');

  const program = await Program.findOne({ title: courseTitle });
  if (!program) throw new Error(`No course titled "${courseTitle}".`);

  // Lesson number → the one video lesson carrying it (shared numbers match nothing).
  const byNumber = new Map();
  for (const m of program.modules) for (const c of m.chapters) for (const t of c.topics) {
    if (t.contentType !== 'video') continue;
    const n = lessonNumber(t.title);
    if (n) byNumber.set(n, byNumber.has(n) ? null : t);
  }

  const changes = [];
  const unmatched = [];
  const used = new Set();
  for (const v of videos) {
    const t = byNumber.get(lessonNumber(lessonLabel(v.name)));
    if (!t) { unmatched.push(v.name); continue; }
    used.add(t);
    if (t.driveFileId === v.id || (onlyEmpty && t.driveFileId)) continue;
    changes.push({ lesson: t.title, file: v.name, replaced: !!t.driveFileId });
    t.driveFileId = v.id;
    t.videoSource = 'drive';
  }
  const bare = [...byNumber.values()].filter((t) => t && !used.has(t)).map((t) => t.title);
  if (write && changes.length) await program.save();
  return { videos: videos.length, changes, unmatched, bare };
}

/**
 * The Claude course's lessons linked to its Drive folder, once, on server
 * start (a marker in skeo_counters), since the live database is only
 * reachable from the server. Lessons that already have a Drive video are left
 * alone, and once only, so an admin's later change is not undone by a
 * restart. If Drive cannot be read, no marker is set and the next start tries
 * again.
 */
export async function linkClaudeDriveVideosOnce() {
  const once = 'drive-videos:2026-11-21';
  if (await Counter.exists({ _id: once })) return { skipped: 'already done', linked: 0 };
  if (!(await Program.exists({ title: 'Claude' }))) return { skipped: 'no Claude course', linked: 0 };
  const r = await linkDriveFolder({ folder: CLAUDE_DRIVE_FOLDER, courseTitle: 'Claude', write: true, onlyEmpty: true });
  await Counter.updateOne({ _id: once }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  return { linked: r.changes.length, videos: r.videos };
}

import mongoose from 'mongoose';
import { keepsClassCacheFresh } from '../utils/classCache.js';
import { parseYouTubeId } from '../utils/youtube.js';

// Curriculum hierarchy from the canvas: Program → Module → Chapter → Topic.
// Edited together as one tree, so embedded as sub-documents.

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    contentType: { type: String, enum: ['video', 'pdf', 'text'], default: 'text' },
    contentUrl: { type: String, default: '' },
    // Where a video lesson's picture comes from. 'url' is the old behaviour --
    // contentUrl handed straight to a <video> tag. 'vdocipher' means the bytes
    // live in VdoCipher under vdoVideoId and are only ever reached through a
    // short-lived, per-viewer OTP minted by routes/videos.js; nothing playable
    // is stored here, so a leaked curriculum dump leaks no video.
    // 'youtube' plays the unlisted YouTube video under youtubeId instead. A
    // lesson keeps both ids, so switching its source back loses nothing.
    videoSource: { type: String, enum: ['url', 'vdocipher', 'youtube'], default: 'url' },
    vdoVideoId: { type: String, default: '', trim: true, index: true },
    // Stored as the bare id whatever link was pasted; anything that is not a
    // YouTube video comes out empty.
    youtubeId: { type: String, default: '', set: parseYouTubeId },
    body: { type: String, default: '' },
    // Where this particular lecture meets. Set by hand and deliberately dumb:
    // a live meeting URL while the class is running, swapped for a YouTube URL once the
    // recording is up. We never inspect it, empty just means "not posted yet".
    classLink: { type: String, default: '' },
    // Two files per lecture, both opened in the in-page viewer. The extension
    // decides how they render (PDF inline, Office formats via the embed), so a
    // admin can attach either kind to either slot without declaring which.
    readingUrl: { type: String, default: '' },  // handout / reading, usually PDF
    notesUrl: { type: String, default: '' },    // slide deck, usually PPTX
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

// A "page" is curriculum text attached to a module or a chapter itself rather
// than to a lesson. It is deliberately NOT a topic: there is nothing to mark
// complete, it takes no contentUrl, and totalTopics() in routes/progress.js
// never sees it, so framing prose can't pad a completion percentage. The
// reader gives it a lesson's exact furniture (crumb, title, chips, footer) so
// the two don't read as two different designs.
const chapterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
    // Markdown shown when the chapter itself is opened.
    description: { type: String, default: '' },
    // What to call that page, in the syllabus row and as the page title. An
    // assignment chapter sets 'Brief': "Overview" is a poor word for the one
    // thing a student opens an assignment to read. Empty falls back to
    // 'Overview' in the client, so authors only set it when it differs.
    pageLabel: { type: String, default: '' },
    topics: { type: [topicSchema], default: [] },
  },
  { _id: true },
);

const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
    // Same idea one level up: markdown shown when the module is opened.
    description: { type: String, default: '' },
    chapters: { type: [chapterSchema], default: [] },
  },
  { _id: true },
);

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true }, // e.g. "Claude"
    slug: { type: String, default: '', trim: true, index: true },
    type: { type: String, default: '' },
    description: { type: String, default: '' },
    published: { type: Boolean, default: false },
    modules: { type: [moduleSchema], default: [] },
  },
  { timestamps: true },
);

// /programs is the most-requested endpoint in the app, and always newest-first.
programSchema.index({ createdAt: -1 });

keepsClassCacheFresh(programSchema);

/* How many lessons a programme has, as an aggregation expression.
 *
 * Several places want this number and nothing else: a student's progress
 * percentage, the at-risk scorer, the admin's per-student overview. Every one
 * of them used to do it by loading `modules` -- the entire curriculum, every
 * chapter and every lesson body, which for the Claude track is hundreds of
 * kilobytes -- and reducing over it in JS. The arithmetic is three nested
 * counts; it belongs where the documents already are.
 *
 * Use it inside a $project:  { total: TOPIC_COUNT }  */
export const TOPIC_COUNT = {
  $sum: {
    $map: {
      input: { $ifNull: ['$modules', []] },
      as: 'm',
      in: {
        $sum: {
          $map: {
            input: { $ifNull: ['$$m.chapters', []] },
            as: 'c',
            in: { $size: { $ifNull: ['$$c.topics', []] } },
          },
        },
      },
    },
  },
};

/** { programId -> lesson count } for the given programmes, counted in the database. */
export async function topicCounts(programIds) {
  const ids = [...new Set((programIds || []).filter(Boolean).map(String))]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return new Map();
  const rows = await Program.aggregate([
    { $match: { _id: { $in: ids } } },
    { $project: { total: TOPIC_COUNT } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.total || 0]));
}

/* The shape of a curriculum without the curriculum in it: per programme, its
 * title, its total lesson count, and one row per module with that module's
 * lesson count. Everything the admin's per-student view and its module-block
 * toggles display -- and nothing else, so the lesson bodies that make up
 * almost all of a programme's bytes stay in the database.
 *
 * Returns Map<programId, { title, total, modules: [{ _id, title, lessons }] }>. */
export async function programOutlines(programIds) {
  const ids = [...new Set((programIds || []).filter(Boolean).map(String))]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return new Map();
  const lessonsIn = {
    $sum: {
      $map: {
        input: { $ifNull: ['$$m.chapters', []] },
        as: 'c',
        in: { $size: { $ifNull: ['$$c.topics', []] } },
      },
    },
  };
  const rows = await Program.aggregate([
    { $match: { _id: { $in: ids } } },
    {
      $project: {
        title: 1,
        total: TOPIC_COUNT,
        modules: {
          $map: {
            input: { $ifNull: ['$modules', []] },
            as: 'm',
            in: { _id: '$$m._id', title: '$$m.title', lessons: lessonsIn },
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

export const Program = mongoose.model('Program', programSchema, 'skeo_programs');

import mongoose from 'mongoose';

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
    videoSource: { type: String, enum: ['url', 'vdocipher'], default: 'url' },
    vdoVideoId: { type: String, default: '', trim: true, index: true },
    body: { type: String, default: '' },
    // Where this particular lecture meets. Set by hand and deliberately dumb:
    // a live meeting URL while the class is running, swapped for a YouTube URL once the
    // recording is up. We never inspect it — empty just means "not posted yet".
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
    // assignment chapter sets 'Brief' — "Overview" is a poor word for the one
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
    title: { type: String, required: true, trim: true }, // e.g. "Kickstarter", "Fellowship"
    slug: { type: String, default: '', trim: true, index: true },
    type: { type: String, default: '' },
    description: { type: String, default: '' },
    published: { type: Boolean, default: false },
    modules: { type: [moduleSchema], default: [] },
  },
  { timestamps: true },
);

export const Program = mongoose.model('Program', programSchema, 'skeo_programs');

import mongoose from 'mongoose';

// Curriculum hierarchy from the canvas: Program → Module → Chapter → Topic.
// Edited together as one tree, so embedded as sub-documents.

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    contentType: { type: String, enum: ['video', 'pdf', 'text'], default: 'text' },
    contentUrl: { type: String, default: '' },
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

const chapterSchema = new mongoose.Schema(
  { title: { type: String, required: true }, order: { type: Number, default: 0 }, topics: { type: [topicSchema], default: [] } },
  { _id: true },
);

const moduleSchema = new mongoose.Schema(
  { title: { type: String, required: true }, order: { type: Number, default: 0 }, chapters: { type: [chapterSchema], default: [] } },
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

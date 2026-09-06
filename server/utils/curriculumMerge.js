// Re-authoring a curriculum tree without re-minting its ids.
//
// Modules, chapters and lessons are embedded sub-documents (see models/
// Program.js). The obvious `program.modules = buildModules()` mints a fresh
// _id for every node, which silently orphans everything keyed on them:
// completion ticks (Progress.completedTopics), admin module blocks
// (User.blocked.moduleIds) and the per-module gate quizzes (Quiz.moduleId).
//
// So merge instead. A node whose position AND title are both unchanged keeps
// the id it already had; anything else is new, and whatever it replaced is
// reported as dropped so the caller can prune what now dangles.

// Fields the curriculum source seeds on a brand-new lesson and then never
// touches again: they belong to whoever attached the media. The VdoCipher id
// matters most — it is minted by an admin's upload and stored nowhere else, so
// overwriting it detaches that video permanently.
export const ADMIN_FIELDS = ['contentUrl', 'videoSource', 'vdoVideoId', 'classLink', 'readingUrl', 'notesUrl'];
// Fields the curriculum source owns outright and may overwrite freely.
const LESSON_FIELDS = ['title', 'contentType', 'body', 'order'];
const CHAPTER_FIELDS = ['title', 'description', 'pageLabel', 'order'];
const MODULE_FIELDS = ['title', 'description', 'order'];

const plain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc });
const differs = (prev, next, fields) =>
  fields.filter((f) => next[f] !== undefined && String(prev?.[f] ?? '') !== String(next[f] ?? ''));

function mergeTopics(existing, desired, path, log) {
  return desired.map((d, i) => {
    const prev = existing[i];
    if (!prev || prev.title !== d.title) {
      log.push(`  + lesson   ${path} > [${i + 1}] ${d.title}`);
      return { ...d, order: i };
    }
    const merged = plain(prev);
    const changed = differs(prev, { ...d, order: i }, LESSON_FIELDS);
    for (const f of LESSON_FIELDS) if (d[f] !== undefined) merged[f] = d[f];
    merged.order = i;
    // Placeholder media seeds a brand-new lesson only. Anything already stored
    // was put there deliberately and wins.
    for (const f of ADMIN_FIELDS) if (!merged[f] && d[f]) merged[f] = d[f];
    if (changed.length) log.push(`  ~ lesson   ${path} > ${d.title} (${changed.join(', ')})`);
    return merged;
  });
}

function mergeChapters(existing, desired, path, log) {
  return desired.map((d, i) => {
    const prev = existing[i];
    const here = `${path} > ${d.title}`;
    if (!prev || prev.title !== d.title) {
      log.push(`  + chapter  ${here}`);
      return { ...d, order: i, topics: mergeTopics([], d.topics || [], here, log) };
    }
    const merged = plain(prev);
    const changed = differs(prev, { ...d, order: i }, CHAPTER_FIELDS);
    for (const f of CHAPTER_FIELDS) if (d[f] !== undefined) merged[f] = d[f];
    merged.order = i;
    if (changed.length) log.push(`  ~ chapter  ${here} (${changed.join(', ')})`);
    merged.topics = mergeTopics(prev.topics || [], d.topics || [], here, log);
    return merged;
  });
}

// Merge a freshly built module tree onto the stored one. Returns the tree to
// save plus a human-readable log — empty when nothing changed, which is what
// makes "run it twice, the second run reports zero changes" a real check.
export function mergeModules(existing, desired) {
  const log = [];
  const modules = desired.map((d, i) => {
    const prev = (existing || [])[i];
    if (!prev || prev.title !== d.title) {
      log.push(`  + module   ${d.title}`);
      return { ...d, order: i, chapters: mergeChapters([], d.chapters || [], d.title, log) };
    }
    const merged = plain(prev);
    const changed = differs(prev, { ...d, order: i }, MODULE_FIELDS);
    for (const f of MODULE_FIELDS) if (d[f] !== undefined) merged[f] = d[f];
    merged.order = i;
    if (changed.length) log.push(`  ~ module   ${d.title} (${changed.join(', ')})`);
    merged.chapters = mergeChapters(prev.chapters || [], d.chapters || [], d.title, log);
    return merged;
  });
  return { modules, log };
}

// Every module and lesson id in a tree, for spotting what a re-author dropped.
export function idsOf(mods) {
  const modules = new Set();
  const topics = new Set();
  for (const m of mods || []) {
    if (m._id) modules.add(String(m._id));
    for (const c of m.chapters || []) for (const t of c.topics || []) if (t._id) topics.add(String(t._id));
  }
  return { modules, topics };
}

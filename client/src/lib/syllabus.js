// Pure helpers behind the Learning syllabus and reader. Kept out of the JSX so
// they can be reasoned about (and run) on their own.

// The three admin-attached media a lesson can carry, in chip order.
export function mediaOf(topic) {
  if (!topic) return { reading: '', notes: '', klass: '' };
  return {
    reading: topic.readingUrl || (topic.contentType === 'pdf' ? topic.contentUrl : '') || '',
    notes: topic.notesUrl || '',
    klass: topic.classLink || '',
  };
}

// A module or chapter has no media of its own, so its page shows the first
// non-empty value of each field among the lessons beneath it — a week's page
// still offers the reading its sessions carry.
export function mediaFrom(topics) {
  const out = { reading: '', notes: '', klass: '' };
  for (const t of topics || []) {
    const m = mediaOf(t);
    for (const key of Object.keys(out)) if (!out[key]) out[key] = m[key];
  }
  return out;
}

// The module header sits directly above its chapter rows, so a chapter title
// that repeats the module's own label ("S1 · Week 3: How Claude Thinks" under
// "Week 3: …") spends one of the two lines we allow saying nothing. Strip the
// repeated label for display only — the stored title and the page crumb keep
// the full name.
export function stripParentContext(chapterTitle, moduleTitle) {
  if (!chapterTitle || !moduleTitle) return chapterTitle || '';
  // The module's leading label: the part before its first separator, and only
  // when it carries a number ("Week 3", "M01", "S02"). A prose module title has
  // no label to repeat, so nothing is stripped.
  const label = (moduleTitle.split(/[:·—–-]/)[0] || '').trim();
  if (!label || !/\d/.test(label)) return chapterTitle;
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = chapterTitle
    .replace(new RegExp(`\\s*\\b${esc}\\b\\s*[:·—–-]?\\s*`, 'gi'), ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[·:—–-]\s*/, '')
    .replace(/\s*[·:—–-]\s*$/, '')
    .trim();
  // Never strip a title down to nothing — a chapter named exactly after its
  // module keeps its name rather than becoming a blank row.
  return out || chapterTitle;
}

// The week strip has room for a number and a few words, so a module title
// that opens with its own label ("Week 3: How Claude Thinks", "M02 · Prompts")
// drops the label — the card already shows the number. A title with no
// numbered label is returned untouched.
export function moduleShortTitle(title) {
  if (!title) return '';
  const m = title.match(/^\s*([^:·—–-]*\d[^:·—–-]*)\s*[:·—–-]\s*(.+)$/);
  return m && m[2].trim() ? m[2].trim() : title.trim();
}

// The last lesson a student opened in a programme, kept in the browser so
// "Continue learning" survives a reload. Storage can be missing or full
// (private tabs, quota), and neither is worth an error on the Learning page.
const lastKey = (programId) => `skeo:lastLesson:${programId}`;
export function readLastLesson(programId) {
  if (!programId) return null;
  try { return window.localStorage.getItem(lastKey(programId)) || null; } catch { return null; }
}
export function writeLastLesson(programId, topicId) {
  if (!programId || !topicId) return;
  try { window.localStorage.setItem(lastKey(programId), String(topicId)); } catch { /* ignore */ }
}

// "1.2 · Tokens, Context Windows & Why Claude Forgets" → the words only, for
// the places that point at a lesson rather than list it: the number is said
// by the line underneath ("Module 1 · Lesson 2 of 54"), so saying it twice
// just costs a phone its one short line.
export function lessonWords(title) {
  const t = (title || '').replace(/^\s*[A-Za-z]?\d+(?:\.\d+)*\s*[·:.\-–—]\s*/, '').trim();
  return t || title || '';
}

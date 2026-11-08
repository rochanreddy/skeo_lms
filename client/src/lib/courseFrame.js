/* The frame around a course's lessons: an "N.0 · Module Intro" opening
 * modules 1, 3, 4, 5 and 6, and a "Module N Recap" closing every module.
 *
 * The server's curriculum source (server/scripts/claudeCurriculum.js) carries
 * the same lessons and the same intro text; keep the two in step. This adds
 * them to a course that is already live, from the curriculum editor, without
 * touching any lesson that is there. Existing lessons keep their ids, so
 * completion ticks and attached videos survive.
 */
import { lessonNumber } from './vdoLinks.js';

// Module number -> the intro's bullet points.
const INTROS = {
  1: [
    'What this module covers: how Claude actually works underneath, where it goes wrong, and which surface to reach for',
    'Why it comes first: every later module assumes you can tell fluent output from accurate output',
    'How each week runs: watch the lessons, try every task in Claude yourself, then take the module quiz to unlock the next week',
  ],
  3: [
    'What this module covers: Claude reading images, drawing diagrams, charts and interactive Artifacts, and polishing visuals in Claude Design',
    'Why it matters: a picture or a working tool often explains more than a paragraph ever could',
    'What you will make: real visual output, from a clean note off a whiteboard photo to a small build you can share',
  ],
  4: [
    'What this module covers: connecting Claude to the tools you already use, cited research, Claude inside Chrome and Office, voice, other languages, and Cowork on real files',
    'Why it matters: the answer you need often lives outside the chat, in your files, your inbox and the web',
    'The habit to build: authorise each connection on purpose, and check the sources Claude brings back',
  ],
  5: [
    'What this module covers: subagents, scheduled and recurring tasks, building with Claude Code, and using all of it responsibly',
    'Why it matters: this is the step from asking Claude for answers to handing it whole pieces of work',
    'The habit to build: define exactly what should come back, and review everything before you ship it',
  ],
  6: [
    'What this module covers: Claude on every device, API basics, team and enterprise features, data and privacy, role-based use, and choosing a plan',
    'Why it matters: the shift from your own use of Claude to how it fits a team or an organisation',
    'The habit to build: know what data goes where before you roll Claude out to anyone else',
  ],
};

export const introTitle = (n) => `${n}.0 · Module Intro`;
export const recapTitle = (n) => `Module ${n} Recap`;
const isRecap = (title, n) => new RegExp(`^\\s*module\\s*0*${n}\\s*[·:\\-–—]?\\s*recap\\b`, 'i').test(String(title || ''));
const isIntro = (title) => /^\s*\d+\.0\b/.test(String(title || '')) || /\bmodule\s+intro\b/i.test(String(title || ''));

const topicsOf = (m) => (m.chapters || []).flatMap((c) => c.topics || []);

/** What the course is missing: { intros: [module index…], recaps: [module index…], count }. */
export function missingFrame(modules) {
  const mods = modules || [];
  const intros = mods
    .map((m, mi) => (INTROS[mi + 1] && !topicsOf(m).some((t) => isIntro(t.title)) ? mi : -1))
    .filter((mi) => mi >= 0);
  const recaps = mods
    .map((m, mi) => (topicsOf(m).some((t) => isRecap(t.title, mi + 1)) ? -1 : mi))
    .filter((mi) => mi >= 0);
  return { intros, recaps, count: intros.length + recaps.length };
}

const lesson = (title, body, like) => ({
  title,
  contentType: 'video',
  videoSource: 'vdocipher',
  vdoVideoId: '',
  contentUrl: '',
  // The course PDF every lesson opens, when the neighbours carry one.
  readingUrl: like?.readingUrl || '',
  body,
});

const firstChapter = (m) => {
  if (!m.chapters?.length) m.chapters = [{ title: 'Lessons', order: 0, topics: [] }];
  return m.chapters;
};

/** Add whatever missingFrame() reports, in place. Returns how many it added. */
export function addFrame(modules) {
  const { intros, recaps, count } = missingFrame(modules);
  for (const mi of intros) {
    const c = firstChapter(modules[mi])[0];
    const body = INTROS[mi + 1].map((p) => `- ${p}`).join('\n');
    c.topics = [lesson(introTitle(mi + 1), body, (c.topics || [])[0]), ...(c.topics || [])];
    c.topics.forEach((t, i) => { t.order = i; });
  }
  for (const mi of recaps) {
    const m = modules[mi];
    const chapters = firstChapter(m);
    const c = chapters[chapters.length - 1];
    c.topics = c.topics || [];
    const covered = topicsOf(m).filter((t) => !isIntro(t.title) && lessonNumber(t.title));
    const body = ['- A run-back through the whole module before its quiz:', ...covered.map((t) => `- ${t.title.replace(/\s*·\s*/, ' ')}`)].join('\n');
    c.topics.push({ ...lesson(recapTitle(mi + 1), body, c.topics[c.topics.length - 1]), order: c.topics.length });
  }
  return count;
}

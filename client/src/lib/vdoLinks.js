/* Which lessons point at a VdoCipher video this account cannot play, and what
 * each should point at instead.
 *
 * A lesson stores only a video id, and ids belong to one VdoCipher account. Move
 * to a new key and every id from the old account is a lesson that answers
 * "Video not found" to a student, with nothing in the editor to say so. This
 * finds them, and lines each up with a video in the library by lesson number:
 * "1.1 · What Generative AI Actually Is" goes with "1.1 What Generative AI
 * Actually Is.mp4". A number that two videos share is not a match, because
 * guessing between them is how the wrong video ends up on a lesson.
 */

/** "1.1 · What…" -> "1.1"; "Module 3 Recap" (or "M03 Recap") -> "3.recap";
 * "Module 2" and untitled -> null. */
export function lessonNumber(title) {
  const r = /^\s*(?:module\s*|m)0*(\d+)\s*[·:\-–—_]?\s*recap\b/i.exec(String(title || ''));
  if (r) return `${r[1]}.recap`;
  const m = /^\s*(\d+(?:\.\d+)+|\d+)(?=[\s.·:)\-–\u2014_]|$)/.exec(String(title || ''));
  return m ? m[1].replace(/\.$/, '') : null;
}

/**
 * @param modules  the programme's curriculum tree
 * @param library  every video the account holds: [{ id, title, status }]
 * @returns one entry per lesson needing attention:
 *   { mi, ci, ti, lesson, videoId, problem: 'missing' | 'empty', match }
 *   'missing' points at an id this account does not have.
 *   'empty'   is a VdoCipher lesson with no video chosen yet.
 *   `match` is the library video with the same lesson number, or null.
 */
export function videoProblems(modules, library) {
  const owned = new Set(library.map((v) => v.id));
  const byNumber = new Map();
  for (const v of library) {
    const n = lessonNumber(v.title);
    if (!n) continue;
    byNumber.set(n, byNumber.has(n) ? null : v); // shared numbers match nothing
  }

  const problems = [];
  (modules || []).forEach((m, mi) => (m.chapters || []).forEach((c, ci) => (c.topics || []).forEach((t, ti) => {
    if (t.contentType !== 'video') return;
    // A lesson with a YouTube link plays that (lib/youtube.js); its VdoCipher
    // video, if any, is not in use, so it is not this check's business.
    if ((t.youtubeId || '').trim()) return;
    const id = (t.vdoVideoId || '').trim();
    if (id && owned.has(id)) return;
    const n = lessonNumber(t.title);
    problems.push({
      mi, ci, ti,
      lesson: t.title || 'Untitled lesson',
      videoId: id,
      problem: id ? 'missing' : 'empty',
      match: (n && byNumber.get(n)) || null,
    });
  })));
  return problems;
}

/** The account's whole library. The API pages at 60, the most it allows.
 * Shared between the editor and its video check, so one visit is one read;
 * `fresh` asks the account again (after an upload, or on "Check again"). */
let libraryPromise = null;
export function loadLibrary(api, { fresh = false } = {}) {
  if (fresh || !libraryPromise) {
    libraryPromise = (async () => {
      const all = [];
      for (let page = 1; page <= 50; page += 1) {
        const { videos } = await api(`/videos?limit=60&page=${page}`);
        all.push(...(videos || []));
        if (!videos || videos.length < 60) break;
      }
      return all;
    })();
    libraryPromise.catch(() => { libraryPromise = null; }); // a failure is not remembered
  }
  return libraryPromise;
}

/** Drop the remembered library (tests, and anything that must not reuse it). */
export function forgetLibrary() { libraryPromise = null; }

export const isReady = (video) => String(video?.status || '').toLowerCase() === 'ready';

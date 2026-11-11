import { useEffect, useMemo, useState } from 'react';
import { lessonNumber } from '../lib/vdoLinks.js';
import { parseYouTubeId, youtubeThumb, youtubeWatchUrl } from '../lib/youtube.js';

/* The curriculum editor's YouTube side: one lesson's link (YouTubeField) and
 * every lesson's at once (YouTubeBulk). Like every edit in the editor, nothing
 * reaches students until Save. */

const UNLISTED_HINT = 'Upload it to YouTube as Unlisted, not Private: a private video will not play for students.';

/** One lesson's YouTube video: paste a link, see the thumbnail, change it. */
export function YouTubeField({ youtubeId, onChange }) {
  const [editing, setEditing] = useState(!youtubeId);
  const [draft, setDraft] = useState('');
  // Another lesson selected, or the id removed: start from its own state.
  useEffect(() => { setEditing(!youtubeId); setDraft(''); }, [youtubeId]);

  // A valid link is taken the moment it is pasted; there is nothing to confirm.
  const take = (text) => {
    setDraft(text);
    const id = parseYouTubeId(text);
    if (id) { onChange(id); setEditing(false); setDraft(''); }
  };

  if (youtubeId && !editing) {
    return (
      <div className="ce-video is-ok ce-yt">
        <img className="ce-yt-thumb" src={youtubeThumb(youtubeId)} alt="" />
        <div className="ce-video-body">
          <p className="ce-video-title">YouTube video linked</p>
          <p className="ce-video-sub">
            <span className="ce-dot is-ok" aria-hidden="true" /> Plays in the skeo player ·{' '}
            <a href={youtubeWatchUrl(youtubeId)} target="_blank" rel="noreferrer">Open on YouTube</a>
          </p>
        </div>
        <div className="ce-video-actions">
          <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}>Change</button>
          <button type="button" className="btn sm ghost" onClick={() => onChange('')}>Remove</button>
        </div>
      </div>
    );
  }

  const invalid = draft.trim() && !parseYouTubeId(draft);
  return (
    <div className="ce-video is-none">
      <p className="ce-video-title">{youtubeId ? 'Paste the new YouTube link' : 'Paste the YouTube link'}</p>
      <p className="ce-video-sub">{UNLISTED_HINT}</p>
      <input
        className="ce-field"
        placeholder="https://youtu.be/…"
        value={draft}
        onChange={(e) => take(e.target.value)}
        aria-invalid={invalid || undefined}
      />
      {invalid && <p className="ce-yt-err">That is not a YouTube video link.</p>}
      {youtubeId && (
        <div className="ce-video-actions">
          <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setDraft(''); }}>Keep the current video</button>
        </div>
      )}
    </div>
  );
}

// Every video lesson, with where it sits in the tree and its lesson number.
function videoLessons(modules) {
  const out = [];
  (modules || []).forEach((m, mi) => (m.chapters || []).forEach((c, ci) => (c.topics || []).forEach((t, ti) => {
    if (t.contentType === 'video') out.push({ mi, ci, ti, t, n: lessonNumber(t.title) });
  })));
  return out;
}

/* Reads pasted lines like "1.3 Hallucinations https://youtu.be/abc" (or a
 * column copied from a sheet) and pairs each with the lesson of that number.
 * A number two lessons share matches neither: guessing is how a lesson ends
 * up with the wrong video. */
export function matchLines(text, lessons) {
  const byNumber = new Map();
  for (const l of lessons) {
    if (!l.n) continue;
    byNumber.set(l.n, byNumber.has(l.n) ? null : l);
  }
  const matched = [];
  const unmatched = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const words = line.split(/\s+/);
    const at = words.findIndex((w) => parseYouTubeId(w.replace(/^[<(["']+|[>)\]"',;]+$/g, '')));
    if (at < 0) { unmatched.push({ line, why: 'no YouTube link in this line' }); continue; }
    const id = parseYouTubeId(words[at].replace(/^[<(["']+|[>)\]"',;]+$/g, ''));
    const rest = words.filter((_, i) => i !== at).join(' ');
    const n = lessonNumber(rest);
    if (!n) { unmatched.push({ line, why: 'no lesson number at the start, like 1.3' }); continue; }
    const lesson = byNumber.get(n);
    if (lesson === null) { unmatched.push({ line, why: `two lessons are numbered ${n}` }); continue; }
    if (!lesson) { unmatched.push({ line, why: `no lesson numbered ${n}` }); continue; }
    const key = `${lesson.mi}.${lesson.ci}.${lesson.ti}`;
    if (seen.has(key)) { unmatched.push({ line, why: `lesson ${n} already has a link above` }); continue; }
    seen.add(key);
    matched.push({ ...lesson, id });
  }
  return { matched, unmatched };
}

/**
 * The course's YouTube links in one place: how many lessons have one, and a
 * box to paste many at once.
 *   onLink(matched)  sets youtubeId on each matched lesson
 */
export function YouTubeBulk({ modules, onLink }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const lessons = useMemo(() => videoLessons(modules), [modules]);
  const { matched, unmatched } = useMemo(() => matchLines(text, lessons), [text, lessons]);

  const withYt = lessons.filter((l) => l.t.youtubeId).length;
  if (!lessons.length) return null;

  const link = () => {
    onLink(matched);
    setText('');
    setOpen(false);
  };

  return (
    <div className="vc vc-note yb" role="region" aria-label="YouTube links">
      <div className="vc-head">
        <div>
          <strong>YouTube: {withYt} of {lessons.length} video lessons linked</strong>
          <p className="vc-sub">
            {UNLISTED_HINT} Paste many links at once, each on a line with its lesson number (“1.3 Hallucinations https://youtu.be/…”), and they are matched for you.
          </p>
        </div>
        <div className="vc-actions">
          <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Close' : 'Paste links'}</button>
        </div>
      </div>

      {open && (
        <div className="yb-body">
          <textarea
            className="ce-field yb-text"
            rows={6}
            placeholder={'1.1 What Generative AI Actually Is  https://youtu.be/…\n1.2 Tokens  https://youtu.be/…\nModule 1 Recap  https://youtu.be/…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          {(matched.length > 0 || unmatched.length > 0) && (
            <ul className="vc-list yb-list">
              {matched.map((m) => (
                <li key={`${m.mi}.${m.ci}.${m.ti}`} className="vc-row">
                  <span className="vc-lesson yb-lesson">{m.t.title}</span>
                  <span className="vc-match">
                    <span aria-hidden="true">→ </span>youtu.be/{m.id}
                    {m.t.youtubeId && m.t.youtubeId !== m.id ? <em className="vc-processing"> replaces its current link</em> : null}
                  </span>
                </li>
              ))}
              {unmatched.map((u, i) => (
                <li key={`u${i}`} className="vc-row yb-miss">
                  <span className="vc-lesson yb-lesson">{u.line}</span>
                  <span className="vc-why">{u.why}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="yb-foot">
            <button type="button" className="btn sm" disabled={!matched.length} onClick={link}>
              {matched.length ? `Link ${matched.length} lesson${matched.length === 1 ? '' : 's'}` : 'Link lessons'}
            </button>
            {unmatched.length > 0 && <span className="muted">{unmatched.length} line{unmatched.length === 1 ? '' : 's'} skipped</span>}
          </div>
        </div>
      )}
    </div>
  );
}

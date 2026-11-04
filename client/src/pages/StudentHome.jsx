import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import LineIcon from '../components/LineIcon.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import { lessonWords } from '../lib/syllabus.js';

// THE STUDENT HOME — four movements, in the order a student actually needs them.
//
//   01 Progress   where you are in the programme
//   02 Projects   what you owe
//   03 Updates    what changed while you were away
//   04 Ad-ons     the extras, once the work is done
//
// Progress is one compact card: a segmented bar (one segment per module, each
// filling as its lessons are done) with the next lesson directly beneath it,
// so the first thing on screen is the thing to do next, not a diagram. The
// module list sits folded under a toggle. Indicative, never gating: every
// module stays clickable, because adult learners revisit material.
export default function StudentHome() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [progress, setProgress] = useState({ completedTopics: [] });
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  // The module list is folded by default: the bar above it already says
  // where you are, and the list is only wanted when you go looking.
  const [showModules, setShowModules] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api('/batches').catch(() => ({ batches: [] })),
      api('/programs').catch(() => ({ programs: [] })),
      api('/assignments?scope=mine').catch(() => ({ assignments: [] })),
      api('/announcements').catch(() => ({ announcements: [] })),
      api('/notifications').catch(() => ({ items: [] })),
    ]).then(async ([bd, pd, ad, nd, nt]) => {
      if (!alive) return;
      setAssignments(ad.assignments || []);
      setAnnouncements(nd.announcements || []);
      setNotes(nt.items || []);

      const progId = (bd.batches || [])[0]?.programId;
      const p = (pd.programs || []).find((x) => x._id === progId) || (pd.programs || [])[0] || null;

      // The list usually carries the curriculum tree already; only pay for the
      // detail request when it doesn't, since the Path is built from modules.
      // Progress is keyed on the programme id, which is known here — so it
      // goes out beside the tree instead of a round trip behind it.
      if (p) {
        const [full] = await Promise.all([
          p.modules?.length ? p : api(`/programs/${p._id}`).then((d) => d.program).catch(() => p),
          api(`/progress/me?programId=${p._id}`).then((d) => { if (alive) setProgress(d); }).catch(() => {}),
        ]);
        if (!alive) return;
        setProgram(full);
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const done = useMemo(() => new Set(progress.completedTopics || []), [progress]);

  // Each module becomes a station, carrying its own completion.
  // Titles arrive as "S01 · AI Foundations" — the code is the station number and
  // the name is the label. Keep the whole string when there's no code.
  const stations = useMemo(() => (program?.modules || []).map((m, i) => {
    const topics = (m.chapters || []).flatMap((c) => c.topics || []);
    const doneCount = topics.filter((t) => done.has(t._id)).length;
    const parts = m.title.split('·').map((s) => s.trim()).filter(Boolean);
    const hasCode = parts.length > 1;
    return {
      id: m._id,
      code: hasCode ? parts[0] : String(i + 1).padStart(2, '0'),
      title: hasCode ? parts.slice(1).join(' · ') : m.title,
      topics,
      done: doneCount,
      total: topics.length,
      complete: topics.length > 0 && doneCount === topics.length,
    };
  }), [program, done]);

  // You are at the first station that isn't finished.
  const nowIndex = useMemo(() => {
    const i = stations.findIndex((s) => !s.complete && s.total > 0);
    return i === -1 ? Math.max(0, stations.length - 1) : i;
  }, [stations]);

  // The single next lesson: first incomplete topic, scanning from the start.
  const nextLesson = useMemo(() => {
    for (const s of stations) {
      for (const t of s.topics) if (!done.has(t._id)) return { topic: t, station: s };
    }
    return null;
  }, [stations, done]);

  const totalTopics = stations.reduce((n, s) => n + s.total, 0);
  const doneTopics = stations.reduce((n, s) => n + s.done, 0);
  const pct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;
  // Anything with a submission counts as handed in, graded or not.
  const submittedCount = assignments.filter((a) => a.mySubmission).length;


  // ── Updates ─── announcements and notifications are one feed to a
  // student; only we care that they come from different collections.
  const updates = useMemo(() => [
    ...announcements.map((a) => ({
      id: `a-${a._id}`, kind: 'Announcement', title: a.title, body: a.body, at: a.createdAt,
    })),
    ...notes.map((n) => ({
      id: `n-${n._id}`, kind: n.type || 'Update', title: n.text, body: '', at: n.createdAt, link: n.link, unread: !n.read,
    })),
  ].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 6), [announcements, notes]);

  const firstName = (user.full_name || user.email).split(' ')[0];

  if (loading) {
    return (
      <div>
        <div className="skeleton sk-title" />
        <div className="skeleton sk-path" />
      </div>
    );
  }

  return (
    <div>
      <p className="serif-lead" style={{ margin: '0 0 30px' }}>Welcome back, {firstName}.</p>

      {/* ═══ 01 · PROGRESS ═══════════════════════════════════════════════ */}
      <section className="sh-sec">
        <SecHead n="01" title="Progress" />
        {stations.length === 0 ? (
          <div className="empty">
            <strong>{program ? 'Your curriculum is being prepared' : 'No programme yet'}</strong>
            {program
              ? 'It will appear here as a path once your team publishes it.'
              : "Once an admin enrols you, your path shows up here."}
          </div>
        ) : (
          <>
          <div className="sp">
            <div className="sp-top">
              <div className="sp-lead">
                <div className="sp-where">
                  {pct === 100 ? 'Programme complete' : `Module ${nowIndex + 1} of ${stations.length}`}
                </div>
                <h1 className="sp-title">{program?.title || 'Your programme'}</h1>
              </div>
              <div className="sp-figure">
                <span className="sp-pct">{pct}<span>%</span></span>
                <span className="sp-sub">{doneTopics} of {totalTopics} lessons</span>
              </div>
            </div>

            {/* The route, as a bar: one segment per module. Done segments are
                solid, the current one fills as its lessons are ticked off. */}
            <div className="sp-bar" role="list" aria-label="Modules">
              {stations.map((s, i) => {
                const state = s.complete ? 'done' : i === nowIndex ? 'now' : 'ahead';
                const fill = s.total ? s.done / s.total : 0;
                return (
                  <button
                    key={s.id}
                    role="listitem"
                    className={`sp-seg ${state}`}
                    style={{ '--fill': fill }}
                    onClick={() => navigate('/app/learning')}
                    title={`${s.code} · ${s.title} — ${s.done} of ${s.total} lessons`}
                    aria-label={`${s.title}, ${s.done} of ${s.total} lessons`}
                  >
                    <span className="sp-seg-fill" />
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="sp-toggle"
              aria-expanded={showModules}
              aria-controls="sp-modules"
              onClick={() => setShowModules((v) => !v)}
            >
              {showModules ? 'Hide modules' : `All ${stations.length} modules`}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>

            {showModules && (
              <div className="sp-list" id="sp-modules">
                {stations.map((s, i) => {
                  const state = s.complete ? 'done' : i === nowIndex ? 'now' : 'ahead';
                  return (
                    <button key={s.id} className={`sp-mod ${state}`} onClick={() => navigate('/app/learning')}>
                      <span className="sp-dot" />
                      <span className="sp-mod-code">{s.code}</span>
                      <span className="sp-mod-title">{s.title}</span>
                      <span className="sp-mod-count">{s.complete ? 'done' : `${s.done}/${s.total}`}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* The one next thing — its own card under the progress, so the
              thing to do next is never buried inside a diagram. */}
          {nextLesson ? (
            <div className="sh-next">
              <span className="sh-next-icon"><LessonIcon type={nextLesson.topic.contentType} size={22} /></span>
              <div className="sh-next-body">
                <div className="sh-next-eyebrow">Next for you</div>
                <h2 className="sh-next-title">{lessonWords(nextLesson.topic.title)}</h2>
                <div className="sh-next-meta">Module {stations.indexOf(nextLesson.station) + 1} · Lesson {doneTopics + 1} of {totalTopics}</div>
              </div>
              <button className="btn" onClick={() => navigate('/app/learning')}>Continue →</button>
            </div>
          ) : (
            <div className="sh-next">
              <span className="sh-next-icon is-done"><LineIcon name="check" size={22} /></span>
              <div className="sh-next-body">
                <div className="sh-next-eyebrow">Every lesson done</div>
                <h2 className="sh-next-title">You've finished {program?.title}.</h2>
                <div className="sh-next-meta">Claim your certificate from the Learning page.</div>
              </div>
              <button className="btn" onClick={() => navigate('/app/learning')}>View certificate</button>
            </div>
          )}
          </>
        )}
      </section>

      {/* ═══ 02 · AT A GLANCE ════════════════════════════════════════════
          Projects, Updates and the standing numbers, three abreast. Each card
          shows the top of its list and hands off to the page that holds the
          rest — Home answers "where am I", not "show me everything". */}
      <section className="sh-sec">
        <SecHead n="02" title="At a glance" />
        <div className="hg">

          {/* Projects — most urgent first. */}
          <div className="hg-card">
            <div className="hg-head">
              <h3>Projects</h3>
              {assignments.length > 0 && (
                <button className="hg-link" onClick={() => navigate('/app/learning?tab=assignments')}>
                  {assignments.length > 3 ? `All ${assignments.length} →` : 'Open →'}
                </button>
              )}
            </div>
            {assignments.length === 0 ? (
              <p className="hg-empty">Projects and assignments show up here when your team publishes them.</p>
            ) : (
              <div className="hg-rows">
                {[...assignments].sort(byUrgency).slice(0, 3).map((a) => {
                  const st = projectStatus(a);
                  return (
                    <button className="hg-row" key={a._id} onClick={() => navigate('/app/learning?tab=assignments')}>
                      <span className={`hg-mark ${st.mark}`}><LineIcon name={a.type === 'project' ? 'rocket' : 'folder'} size={17} /></span>
                      <span className="hg-text">
                        <span className="hg-title">{a.title}</span>
                        <span className="hg-sub">
                          {a.type === 'project' ? 'Project' : 'Assignment'}
                          {a.dueDate && <> · {st.late ? 'was due' : 'due'} {fmtDate(a.dueDate)}</>}
                        </span>
                      </span>
                      <span className={`status ${st.cls}`}>{st.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Updates — announcements and notifications, one feed. */}
          <div className="hg-card">
            <div className="hg-head">
              <h3>Updates</h3>
              {updates.length > 3 && <span className="hg-note">+{updates.length - 3} more</span>}
            </div>
            {updates.length === 0 ? (
              <p className="hg-empty">Announcements and alerts from your team will collect here.</p>
            ) : (
              <div className="hg-rows">
                {updates.slice(0, 3).map((u) => (
                  <div className="hg-row" key={u.id}>
                    <span className={`hg-mark ${u.kind === 'Announcement' ? 'is-amber' : 'is-sky'}`}>
                      <LineIcon name={u.kind === 'Announcement' ? 'megaphone' : 'bell'} size={17} />
                    </span>
                    <span className="hg-text">
                      <span className="hg-title">{u.title}</span>
                      <span className="hg-sub">{u.kind} · {fmtDate(u.at)}</span>
                    </span>
                    {u.unread && <span className="hg-dot" aria-label="Unread" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Your standing — only figures we actually hold. */}
          <div className="hg-card hg-standing">
            <div className="hg-head"><h3>Your standing</h3></div>
            <div className="hg-stats">
              <div className="hg-stat">
                <span className="hg-stat-n">{submittedCount}<small>/{assignments.length}</small></span>
                <span className="hg-stat-l">Submitted</span>
              </div>
              <div className="hg-stat">
                <span className="hg-stat-n">{doneTopics}<small>/{totalTopics}</small></span>
                <span className="hg-stat-l">Lessons done</span>
              </div>
              <div className="hg-stat">
                <span className="hg-stat-n">{pct}<small>%</small></span>
                <span className="hg-stat-l">{stations.length ? `${stations.length} module${stations.length === 1 ? '' : 's'}` : 'Programme'}</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══ 03 · FROM MENLER ════════════════════════════════════════════
          Promo slots for the main Menler site. Deliberately empty scaffolding:
          drop a creative into each <MenlerAd>, or hand it an href and an image
          and it becomes a link. Nothing here fetches or tracks anything. */}
      <section className="sh-sec">
        <SecHead n="03" title="From Menler" />
        <p className="sh-sub">More from the team behind your programme.</p>
        <div className="sh-ads">
          <MenlerAd slot="home-1" />
          <MenlerAd slot="home-2" />
          <MenlerAd slot="home-3" />
        </div>
      </section>
    </div>
  );
}

// One Menler promo slot.
//
// Empty by default, and empty is a valid state — an unfilled slot renders a
// quiet placeholder rather than collapsing, so the row keeps its shape while
// creatives are still being written. Fill one by passing `image` (+ `alt`) for
// a plain creative, or `href` as well to make it a link; `title`/`body` render
// a text promo when there is no artwork.
function MenlerAd({ slot, href, image, alt = '', title, body, cta = 'Learn more →' }) {
  const filled = image || title;

  const inner = image ? (
    // Dimensions are set in CSS; the attributes keep the box reserved before
    // the stylesheet lands so a late creative can't shift the row.
    <img className="sh-ad-img" src={image} alt={alt} width="400" height="225" loading="lazy" decoding="async" />
  ) : (
    <>
      <span className="sh-ad-title">{title}</span>
      {body && <span className="sh-ad-body">{body}</span>}
      {href && <span className="sh-ad-cta">{cta}</span>}
    </>
  );

  if (!filled) {
    return <div className="sh-ad is-empty" data-slot={slot} aria-hidden="true"><span>Ad slot</span></div>;
  }

  return href ? (
    <a className="sh-ad" data-slot={slot} href={href} target="_blank" rel="noreferrer sponsored">{inner}</a>
  ) : (
    <div className="sh-ad" data-slot={slot}>{inner}</div>
  );
}

// The numbered section header — the number, the ruled title, a hairline out to
// whatever the section wants to put on the right.
function SecHead({ n, title, children }) {
  return (
    <div className="sh-head">
      <span className="sh-num">{n}</span>
      <h2>{title}</h2>
      <span className="sh-rule" />
      {children}
    </div>
  );
}

// ── formatting ────────────────────────────────────────────────────────────
const fmtDate = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });

// Graded → Submitted → Overdue → To do, each with its own dot colour.
function projectStatus(a) {
  const sub = a.mySubmission;
  if (sub?.status === 'graded') {
    return { label: sub.score != null ? `Graded · ${sub.score}` : 'Graded', cls: 'status-done', mark: 'is-green' };
  }
  if (sub) return { label: 'Submitted', cls: 'status-progress', mark: 'is-green' };
  const late = a.dueDate && new Date(a.dueDate) < new Date();
  if (late) return { label: 'Overdue', cls: 'status-late', mark: 'is-rose', late: true };
  return { label: 'To do', cls: 'status-todo', mark: '' };
}

// What needs doing first: unsubmitted before submitted, then by due date, then
// the undated ones last so they never crowd out a real deadline.
function byUrgency(x, y) {
  const open = (a) => (a.mySubmission ? 1 : 0);
  if (open(x) !== open(y)) return open(x) - open(y);
  if (x.dueDate && y.dueDate) return new Date(x.dueDate) - new Date(y.dueDate);
  return x.dueDate ? -1 : y.dueDate ? 1 : 0;
}

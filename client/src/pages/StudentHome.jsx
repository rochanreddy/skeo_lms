import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import LineIcon from '../components/LineIcon.jsx';

// THE STUDENT HOME — four movements, in the order a student actually needs them.
//
//   01 Progress   where you are in the programme
//   02 Projects   what you owe
//   03 Updates    what changed while you were away
//   04 Ad-ons     the extras, once the work is done
//
// Progress stays spatial — the curriculum is drawn as a route with modules as
// stations, so you SEE how far along you are instead of reading a percentage.
// The path is indicative, never gating: every station stays clickable, because
// adult learners revisit material and locking that is hostile.
export default function StudentHome() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [progress, setProgress] = useState({ completedTopics: [] });
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <div className="path-where">Loading your path…</div>
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
            <div className="path-hero">
              <div className="path-lead">
                <div>
                  <div className="path-where">
                    {pct === 100 ? 'Programme complete' : `Module ${nowIndex + 1} of ${stations.length}`}
                  </div>
                  <h1 className="path-title">{program?.title || 'Your programme'}</h1>
                </div>
                <div className="path-figure">
                  <span className="path-figure-num">{pct}<span>%</span></span>
                  <div className="path-figure-sub">{doneTopics} of {totalTopics} lessons</div>
                </div>
              </div>

              {/* The route */}
              <div className="path" role="list">
                {stations.map((s, i) => {
                  const state = s.complete ? 'done' : i === nowIndex ? 'now' : 'ahead';
                  return (
                    <button
                      key={s.id}
                      role="listitem"
                      className={`path-station ${state}`}
                      onClick={() => navigate('/app/learning')}
                      title={`${s.done} of ${s.total} lessons complete`}
                    >
                      <span className="path-dot" />
                      <span className="path-code">{s.code}</span>
                      <span className="path-label">{s.title}</span>
                      <span className="path-state">
                        {s.complete ? 'done' : i === nowIndex ? `${s.done}/${s.total} · you are here` : `${s.total} lesson${s.total === 1 ? '' : 's'}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* The one next thing */}
            {nextLesson ? (
              <div className="path-next">
                <div style={{ minWidth: 0 }}>
                  <div className="path-next-eyebrow">Next for you</div>
                  <h2 className="path-next-title">{nextLesson.topic.title}</h2>
                  <div className="path-next-meta">
                    <span>{nextLesson.station.title}</span>
                    <span className="dot ahead" />
                    <span>{nextLesson.topic.contentType || 'text'}</span>
                    <span className="dot ahead" />
                    <span>lesson {doneTopics + 1} of {totalTopics}</span>
                  </div>
                </div>
                <button className="btn" onClick={() => navigate('/app/learning')}>Continue →</button>
              </div>
            ) : (
              <div className="path-next">
                <div>
                  <div className="path-next-eyebrow">Every lesson done</div>
                  <h2 className="path-next-title">You've finished {program?.title}.</h2>
                  <p className="path-next-meta">Claim your certificate from the Learning page.</p>
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
        <div className="sh-cards">

          {/* Projects — most urgent first, same ordering the full list used. */}
          <div className="sh-card">
            <div className="sh-card-head">Projects</div>
            {assignments.length === 0 ? (
              <p className="sh-card-empty">Projects and assignments show up here when your team publishes them.</p>
            ) : (
              <div className="sh-card-list">
                {[...assignments].sort(byUrgency).slice(0, 3).map((a) => {
                  const st = projectStatus(a);
                  return (
                    <button className="sh-row" key={a._id} onClick={() => navigate('/app/learning')}>
                      <span className={`sh-row-mark ${st.mark}`}><LineIcon name={a.type === 'project' ? 'rocket' : 'folder'} size={16} /></span>
                      <span className="sh-row-body">
                        <span className="sh-row-title">{a.title}</span>
                        <span className="sh-row-sub">
                          {a.type === 'project' ? 'Project' : 'Assignment'}
                          {a.dueDate && <> · {st.late ? 'Was due ' : 'Due '}{fmtDate(a.dueDate)}</>}
                        </span>
                      </span>
                      <span className={`status ${st.cls}`}>{st.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button className="sh-card-more" onClick={() => navigate('/app/learning')}>
              {assignments.length > 3 ? `Open all ${assignments.length} →` : 'Open all →'}
            </button>
          </div>

          {/* Updates — announcements and notifications, one feed. */}
          <div className="sh-card">
            <div className="sh-card-head">Updates</div>
            {updates.length === 0 ? (
              <p className="sh-card-empty">Announcements and alerts from your team will collect here.</p>
            ) : (
              <div className="sh-card-list">
                {updates.slice(0, 3).map((u) => (
                  <div className="sh-row is-static" key={u.id}>
                    <span className={`sh-row-mark ${u.kind === 'Announcement' ? 'is-amber' : 'is-sky'}`}>
                      <LineIcon name={u.kind === 'Announcement' ? 'megaphone' : 'bell'} size={16} />
                    </span>
                    <span className="sh-row-body">
                      <span className="sh-row-title">{u.title}</span>
                      <span className="sh-row-sub">{u.kind} · {fmtDate(u.at)}</span>
                    </span>
                    {u.unread && <span className="dot now" />}
                  </div>
                ))}
              </div>
            )}
            {updates.length > 3 && <div className="sh-card-more is-note">{updates.length - 3} more</div>}
          </div>

          {/* Your standing — only figures we actually hold. There is no
              attendance endpoint, so no attendance row: a permanent "0 of 0"
              would look like a broken stat rather than an absent feature. */}
          <div className="sh-card">
            <div className="sh-card-head">Your standing</div>
            <div className="sh-stats">
              <div className="sh-stat">
                <div className="sh-stat-label">
                  <strong>Assignments</strong>
                  <span>submitted</span>
                </div>
                <div className="sh-stat-value">{submittedCount}<span>/{assignments.length}</span></div>
              </div>
              <div className="sh-stat">
                <div className="sh-stat-label">
                  <strong>Lessons</strong>
                  <span>completed</span>
                </div>
                <div className="sh-stat-value">{doneTopics}<span>/{totalTopics}</span></div>
              </div>
              <div className="sh-stat">
                <div className="sh-stat-label">
                  <strong>Programme</strong>
                  <span>{stations.length ? `${stations.length} module${stations.length === 1 ? '' : 's'}` : 'not started'}</span>
                </div>
                <div className="sh-stat-value">{pct}<span>%</span></div>
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

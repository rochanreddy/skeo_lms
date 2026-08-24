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
  const [addons, setAddons] = useState({ library: 0, jobs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api('/batches').catch(() => ({ batches: [] })),
      api('/programs').catch(() => ({ programs: [] })),
      api('/assignments?scope=mine').catch(() => ({ assignments: [] })),
      api('/announcements').catch(() => ({ announcements: [] })),
      api('/notifications').catch(() => ({ items: [] })),
      api('/library').catch(() => ({ items: [] })),
      api('/jobs').catch(() => ({ jobs: [] })),
    ]).then(async ([bd, pd, ad, nd, nt, lib, jb]) => {
      if (!alive) return;
      setAssignments(ad.assignments || []);
      setAnnouncements(nd.announcements || []);
      setNotes(nt.items || []);
      setAddons({ library: (lib.items || []).length, jobs: (jb.jobs || []).length });

      const progId = (bd.batches || [])[0]?.programId;
      const p = (pd.programs || []).find((x) => x._id === progId) || (pd.programs || [])[0] || null;

      // The list usually carries the curriculum tree already; only pay for the
      // detail request when it doesn't, since the Path is built from modules.
      if (p) {
        const full = p.modules?.length ? p : await api(`/programs/${p._id}`).then((d) => d.program).catch(() => p);
        if (!alive) return;
        setProgram(full);
        api(`/progress/me?programId=${p._id}`).then((d) => alive && setProgress(d)).catch(() => {});
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

      {/* ═══ 02 · PROJECTS ═══════════════════════════════════════════════ */}
      <section className="sh-sec">
        <SecHead n="02" title="Projects">
          <button className="sh-more" onClick={() => navigate('/app/learning')}>Open all →</button>
        </SecHead>
        {assignments.length === 0 ? (
          <div className="empty"><strong>Nothing set yet</strong>Projects and assignments show up here when your team publishes them.</div>
        ) : (
          <div className="sh-list">
            {[...assignments].sort(byUrgency).slice(0, 5).map((a) => {
              const st = projectStatus(a);
              return (
                <div className="sh-item" key={a._id} role="button" tabIndex={0}
                  onClick={() => navigate('/app/learning')}
                  onKeyDown={(e) => e.key === 'Enter' && navigate('/app/learning')}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`sh-item-mark ${st.mark}`}><LineIcon name={a.type === 'project' ? 'rocket' : 'folder'} size={19} /></span>
                  <div className="sh-item-body">
                    <div className="sh-item-title">{a.title}</div>
                    <div className="sh-item-sub">
                      <span>{a.type === 'project' ? 'Project' : 'Assignment'}</span>
                      {a.dueDate && <><span className="sh-sep" /><span>{st.late ? 'Was due ' : 'Due '}{fmtDate(a.dueDate)}</span></>}
                    </div>
                  </div>
                  <div className="sh-item-end">
                    <span className={`status ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ 03 · UPDATES ════════════════════════════════════════════════ */}
      <section className="sh-sec">
        <SecHead n="03" title="Updates" />
        {updates.length === 0 ? (
          <div className="empty"><strong>All quiet</strong>Announcements and alerts from your team will collect here.</div>
        ) : (
          <div className="sh-list">
            {updates.map((u) => (
              <div className="sh-item" key={u.id}>
                <span className={`sh-item-mark ${u.kind === 'Announcement' ? 'is-amber' : 'is-sky'}`}>
                  <LineIcon name={u.kind === 'Announcement' ? 'megaphone' : 'bell'} size={19} />
                </span>
                <div className="sh-item-body">
                  <div className="sh-item-title">{u.title}</div>
                  <div className="sh-item-sub">
                    <span>{u.kind}</span>
                    <span className="sh-sep" />
                    <span>{fmtDate(u.at)}</span>
                    {u.body && <><span className="sh-sep" /><span>{u.body}</span></>}
                  </div>
                </div>
                {u.unread && <span className="sh-item-end"><span className="dot now" /></span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ 04 · AD-ONS ═════════════════════════════════════════════════ */}
      <section className="sh-sec">
        <SecHead n="04" title="Ad-ons" />
        <p className="sh-sub">Everything beyond the coursework — resources, careers and the people around you.</p>
        <div className="sh-addons">
          <button className="sh-addon" onClick={() => navigate('/app/library')}>
            <span className="sh-addon-mark"><LineIcon name="book" size={20} /></span>
            <span className="sh-addon-title">Library</span>
            <span className="sh-addon-sub">
              {addons.library > 0 ? `${addons.library} slide deck${addons.library === 1 ? '' : 's'}, eBook${addons.library === 1 ? '' : 's'} and notes` : 'Slides, eBooks and notes'}
            </span>
            <span className="sh-addon-go">Browse →</span>
          </button>
          <button className="sh-addon" onClick={() => navigate('/app/jobs')}>
            <span className="sh-addon-mark"><LineIcon name="briefcase" size={20} /></span>
            <span className="sh-addon-title">Job Board</span>
            <span className="sh-addon-sub">
              {addons.jobs > 0 ? `${addons.jobs} opening${addons.jobs === 1 ? '' : 's'} you can apply to today` : 'Jobs and internships from the team'}
            </span>
            <span className="sh-addon-go">View roles →</span>
          </button>
          <button className="sh-addon" onClick={() => navigate('/app/grades')}>
            <span className="sh-addon-mark"><LineIcon name="chart" size={20} /></span>
            <span className="sh-addon-title">Grades</span>
            <span className="sh-addon-sub">Every quiz score and graded project in one place.</span>
            <span className="sh-addon-go">See grades →</span>
          </button>
        </div>
      </section>
    </div>
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
const fmtLong = (d) => new Date(d).toLocaleString([], {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const fmtDate = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
const cleanBatch = (name) => name.replace(/^Demo — /, '');

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

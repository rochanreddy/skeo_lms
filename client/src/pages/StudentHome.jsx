import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import LineIcon from '../components/LineIcon.jsx';

// THE PATH — the student home.
//
// Not a dashboard of tiles. The curriculum is drawn as a route: modules are
// stations along the violet rule, dots say where you are, and one card tells
// you the single next thing to do. Progress is spatial, so you SEE how far
// along you are instead of reading a percentage.
//
// The path is indicative, never gating — every station stays clickable.
// Adult learners revisit material, and locking that is hostile.
export default function StudentHome() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [progress, setProgress] = useState({ completedTopics: [], total: 0, pct: 0 });
  const [sessions, setSessions] = useState([]);
  const [pastSessions, setPastSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [att, setAtt] = useState({ pct: 0, present: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api('/batches').catch(() => ({ batches: [] })),
      api('/programs').catch(() => ({ programs: [] })),
      api('/sessions?scope=upcoming').catch(() => ({ sessions: [] })),
      // Past sessions too: the Join Live Class button falls back to the most
      // recent one when nothing is scheduled today. Comes back newest-first.
      api('/sessions?scope=past').catch(() => ({ sessions: [] })),
      api('/assignments?scope=mine').catch(() => ({ assignments: [] })),
      api('/announcements').catch(() => ({ announcements: [] })),
      api('/attendance/me').catch(() => ({ pct: 0, present: 0, total: 0 })),
    ]).then(async ([bd, pd, sd, psd, ad, nd, at]) => {
      if (!alive) return;
      setSessions(sd.sessions || []);
      setPastSessions(psd.sessions || []);
      setAssignments(ad.assignments || []);
      setAnnouncements(nd.announcements || []);
      setAtt(at);

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

  // Only surface a session if it's genuinely imminent (or running).
  const live = sessions.find((s) => {
    const start = new Date(s.startsAt).getTime();
    return start - Date.now() < 3 * 60 * 60 * 1000 && start + 3 * 60 * 60 * 1000 > Date.now();
  });
  const markJoin = (id) => api(`/attendance/join/${id}`, { method: 'POST' }).catch(() => {});

  // The Join Live Class call-to-action. One rule, stated plainly:
  //   a class on TODAY's date  → that Zoom link, "Join Today's Live Class"
  //   nothing today            → the newest past class, "Watch Previous Live Class"
  // The wording carries the difference so nobody clicks expecting a room that
  // isn't open. A class earlier today still counts as today's — it has already
  // slipped into the "past" list, which is why both lists are searched.
  const liveClass = useMemo(() => {
    const isToday = (d) => {
      const a = new Date(d), b = new Date();
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };
    // Upcoming is ascending and past is descending, so the first hit in either
    // is the one nearest to now.
    const today = sessions.find((s) => isToday(s.startsAt)) || pastSessions.find((s) => isToday(s.startsAt));
    const session = today || pastSessions[0];
    if (!session) return null;
    return {
      session,
      today: Boolean(today),
      // A finished class may only have a recording — better than a dead button.
      url: session.joinUrl || (!today && session.recordingUrl) || '',
    };
  }, [sessions, pastSessions]);

  const openDue = assignments
    .filter((a) => !a.mySubmission && a.dueDate)
    .sort((x, y) => new Date(x.dueDate) - new Date(y.dueDate));
  const firstName = (user.full_name || user.email).split(' ')[0];

  if (loading) {
    return (
      <div className="path-wrap">
        <div className="path-where">Loading your path…</div>
        <div className="skeleton sk-title" />
        <div className="skeleton sk-path" />
      </div>
    );
  }

  return (
    <div>
      <div className="path-wrap">
        {/* Above the hero, before anything else — the class is the thing a
            student is most likely to have opened this page for. */}
        {liveClass && (
          <div className={`live-cta ${liveClass.today ? 'is-live' : 'is-replay'}`}>
            <span className="live-cta-mark">
              {liveClass.today ? <span className="path-live-pulse" /> : <LineIcon name="video" size={18} />}
            </span>
            <div className="live-cta-copy">
              <div className="live-cta-eyebrow">{liveClass.today ? 'Live class today' : 'No live class today'}</div>
              <div className="live-cta-title">{liveClass.session.title}</div>
              <div className="live-cta-time">
                {new Date(liveClass.session.startsAt).toLocaleString([], {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
                {liveClass.session.batchId?.name ? ` · ${liveClass.session.batchId.name.replace(/^Demo — /, '')}` : ''}
              </div>
            </div>
            {liveClass.url ? (
              <a
                className="btn live-cta-btn"
                href={liveClass.url}
                target="_blank"
                rel="noreferrer"
                // Attendance is only meaningful for the class that's actually
                // on today — watching a past one shouldn't mark you present.
                onClick={() => liveClass.today && markJoin(liveClass.session._id)}
              >
                <LineIcon name="video" size={17} />
                {liveClass.today ? "Join Today's Live Class" : 'Watch Previous Live Class'}
              </a>
            ) : (
              <span className="live-cta-time" style={{ marginLeft: 'auto' }}>Link coming soon</span>
            )}
          </div>
        )}

        {stations.length === 0 ? (
          <>
            <p className="serif-lead">Welcome, {firstName}.</p>
            <div className="panel empty-state" style={{ marginTop: 20 }}>
              <p className="muted">
                {program
                  ? 'Your curriculum is still being prepared — it will appear here as a path once it is published.'
                  : "You're not enrolled in a programme yet. Once an admin adds you to a batch, your path shows up here."}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="path-hero">
              <div className="path-lead">
                <div>
                  <div className="path-where">
                    {pct === 100 ? 'Programme complete' : `Module ${nowIndex + 1} of ${stations.length} · ${firstName}'s path`}
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

            {/* The imminent-session strip stays for a class starting soon, but
                never for the one already sitting in the button up top. */}
            {live && live._id !== liveClass?.session._id && (
              <div className="path-live">
                <span className="path-live-pulse" />
                <div>
                  <div className="path-live-title">{live.title}</div>
                  <div className="path-live-time">
                    {new Date(live.startsAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                    {live.batchId?.name ? ` · ${live.batchId.name.replace(/^Demo — /, '')}` : ''}
                  </div>
                </div>
                {live.joinUrl
                  ? <a className="btn on-stage" href={live.joinUrl} target="_blank" rel="noreferrer" onClick={() => markJoin(live._id)}>Join now</a>
                  : <span className="path-live-time" style={{ marginLeft: 'auto' }}>Link coming soon</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Everything else is secondary and stays quiet. */}
      <div className="home-grid">
        <section>
          <h3 className="ruled-head">Due next</h3>
          {openDue.length === 0 ? (
            <p className="muted">Nothing outstanding. {assignments.length > 0 && 'All submitted.'}</p>
          ) : (
            <div className="qlist">
              {openDue.slice(0, 4).map((a) => {
                const late = new Date(a.dueDate) < new Date();
                return (
                  <div className="qrow" key={a._id}>
                    <span className={`dot ${late ? 'late' : 'ahead'}`} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="qrow-title">{a.title}</div>
                      <div className="qrow-sub">
                        {late ? 'Overdue · ' : ''}
                        {new Date(a.dueDate).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <span className={`status ${late ? 'status-late' : 'status-todo'}`}>{late ? 'Overdue' : 'To do'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h3 className="ruled-head">Coming up</h3>
          {sessions.length === 0 ? (
            <p className="muted">No sessions scheduled yet.</p>
          ) : (
            <div className="qlist">
              {sessions.slice(0, 4).map((s) => (
                <div className="qrow" key={s._id}>
                  <span className="dot ahead" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="qrow-title">{s.title}</div>
                    <div className="qrow-sub">
                      {new Date(s.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {s.joinUrl && (
                    <a className="btn quiet sm" href={s.joinUrl} target="_blank" rel="noreferrer" onClick={() => markJoin(s._id)}>Join</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="ruled-head">Your standing</h3>
          <div className="qlist">
            <div className="qrow">
              <div style={{ flex: 1 }}><div className="qrow-title">Attendance</div><div className="qrow-sub">{att.present} of {att.total} sessions</div></div>
              <span className="figure">{att.total ? `${att.pct}%` : '—'}</span>
            </div>
            <div className="qrow">
              <div style={{ flex: 1 }}><div className="qrow-title">Assignments</div><div className="qrow-sub">submitted</div></div>
              <span className="figure">{assignments.filter((a) => a.mySubmission).length}/{assignments.length}</span>
            </div>
            <div className="qrow">
              <div style={{ flex: 1 }}><div className="qrow-title">Lessons</div><div className="qrow-sub">completed</div></div>
              <span className="figure">{doneTopics}/{totalTopics}</span>
            </div>
          </div>
        </section>

        {announcements.length > 0 && (
          <section className="home-wide">
            <h3 className="ruled-head">Announcements</h3>
            <div className="qlist">
              {announcements.slice(0, 3).map((a) => (
                <div className="qrow" key={a._id}>
                  <span className="dot ahead" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="qrow-title">{a.title}</div>
                    {a.body && <div className="qrow-sub">{a.body}</div>}
                  </div>
                  <span className="qrow-sub">{new Date(a.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

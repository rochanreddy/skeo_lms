import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import LineIcon from './LineIcon.jsx';
import Markdown from './Markdown.jsx';
import { SubmissionCheckPanel } from './SubmissionCheck.jsx';
import DateTimePicker from './DateTimePicker.jsx';

const dueLabel = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// The admin's batch detail: enrol students, schedule sessions, mark attendance,
// set assignments, author quizzes and grade. With only two roles there is no
// second view of this screen, so there is no mode to switch on.
export default function BatchWorkspace({ batchId }) {
  const [batch, setBatch] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [gradebook, setGradebook] = useState(null);
  const [msg, setMsg] = useState('');
  const [newStudent, setNewStudent] = useState(null); // { email, password } if an account was auto-created
  const [allStudents, setAllStudents] = useState([]);
  const [pickStudent, setPickStudent] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const loadBatch = () => api(`/batches/${batchId}`).then((d) => setBatch(d.batch)).catch(() => {});
  const loadSessions = () => api(`/sessions?batchId=${batchId}`).then((d) => setSessions(d.sessions || [])).catch(() => {});
  const loadAssignments = () => api(`/assignments?batchId=${batchId}`).then((d) => setAssignments(d.assignments || [])).catch(() => {});
  const loadQuizzes = () => api(`/quizzes?batchId=${batchId}`).then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
  const loadPeople = () => {
    api('/users?role=student').then((d) => setAllStudents(d.users || [])).catch(() => {});
  };
  const loadAnnouncements = () => api(`/announcements?batchId=${batchId}`).then((d) => setAnnouncements(d.announcements || [])).catch(() => {});
  const loadGradebook = () => api(`/grades/batch/${batchId}`).then(setGradebook).catch(() => setGradebook(null));
  useEffect(() => { loadBatch(); loadSessions(); loadAssignments(); loadQuizzes(); loadAnnouncements(); loadGradebook(); }, [batchId]);
  useEffect(() => { loadPeople(); }, []);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  async function act(fn, okMsg) { try { await fn(); flash(okMsg); } catch (e) { flash(e.message); } }

  async function enrolExisting() {
    const s = allStudents.find((x) => x.id === pickStudent);
    if (!s) return;
    await act(() => api(`/batches/${batchId}/students`, { method: 'POST', body: { email: s.email } }).then(() => { setPickStudent(''); loadBatch(); }), 'Student enrolled');
  }
  async function enrolNew(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setNewStudent(null);
    try {
      const res = await api(`/batches/${batchId}/students`, { method: 'POST', body: { email: newEmail } });
      setNewEmail('');
      loadBatch();
      if (res.created) { setNewStudent({ email: res.user.email, password: res.tempPassword }); loadPeople(); }
      else flash('Student enrolled');
    } catch (e2) { flash(e2.message); }
  }
  async function removeMember(userId) {
    await act(() => api(`/batches/${batchId}/members/${userId}`, { method: 'DELETE' }).then(loadBatch), 'Removed');
  }

  // Admin course-block: hide THIS batch from one member (they keep the rest of
  // their LMS). Toggles the batch id in the user's blocked.batchIds set.
  const courseBlocked = (u) => ((u.blocked?.batchIds) || []).map(String).includes(String(batchId));
  async function toggleCourseBlock(u) {
    const ids = new Set(((u.blocked?.batchIds) || []).map(String));
    const wasBlocked = ids.has(String(batchId));
    if (wasBlocked) ids.delete(String(batchId)); else ids.add(String(batchId));
    await act(
      () => api(`/users/${u._id}/blocks`, { method: 'PATCH', body: { batchIds: [...ids] } }).then(loadBatch),
      wasBlocked ? 'Course unblocked for member' : 'Course blocked for member',
    );
  }

  if (!batch) return <div className="skeleton"><div className="skeleton-row" /><div className="skeleton-row tall" /><div className="skeleton-row tall" /></div>;
  const availableStudents = allStudents.filter((s) => !batch.studentIds.some((bs) => bs._id === s.id));

  return (
    <div className="stack batch-ws">
      <div className="ws-head">
        <div>
          <h2 style={{ margin: 0 }}>{batch.name}</h2>
          <div className="ws-tags">
            {batch.programId?.title && <span className="badge badge-accent">{batch.programId.title}</span>}
            <span className="badge badge-muted">{batch.status}</span>
          </div>
        </div>
        <div className="row">
          {msg && <span className="ws-flash">{msg}</span>}
          <button className="btn sm ghost" onClick={() => downloadFile(`/reports/batch/${batchId}`)}>Batch report (CSV)</button>
        </div>
      </div>

      {/* Roster */}
      <section className="panel">
        <h3 className="ws-h3">Roster</h3>
        <div className="roster">
          <div className="roster-col">
            <div className="roster-col-head">Students <span className="roster-n">{batch.studentIds.length}</span></div>
            <div className="member-list">
              {batch.studentIds.map((s) => (
                <MemberRow
                  key={s._id}
                  user={s}
                  kind="student"
                  href={`/app/students/${s._id}`}
                  blocked={courseBlocked(s)}
                  onToggleBlock={() => toggleCourseBlock(s)}
                  onRemove={() => removeMember(s._id)}
                />
              ))}
              {batch.studentIds.length === 0 && <p className="muted roster-empty">No students enrolled yet.</p>}
            </div>
          </div>
        </div>

        <>
          <div className="roster-controls">
            <div className="rc-card">
              <label>Enrol an existing student</label>
              <select className="rc-select" value={pickStudent} onChange={(e) => setPickStudent(e.target.value)}>
                <option value="">Choose a student…</option>
                {availableStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
              </select>
              <button className="btn sm rc-btn" onClick={enrolExisting} disabled={!pickStudent}>Enrol student</button>
            </div>

            <div className="rc-card">
              <label>New paid student</label>
              <form className="rc-form" onSubmit={enrolNew}>
                <input className="rc-input" type="email" placeholder="Email they enrolled with" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <button className="btn sm ghost rc-btn">Create &amp; enrol</button>
              </form>
            </div>
          </div>

          {newStudent && (
            <div className="tempbox">
              <div className="tempbox-line"><span className="tempbox-ic"><LineIcon name="check" size={16} /></span><span>New student account created for <strong>{newStudent.email}</strong> — temp password: <code>{newStudent.password}</code></span></div>
              <div className="muted">Share these; they'll set their own password on first login.</div>
            </div>
          )}
        </>
      </section>

      {/* Announcements */}
      <section className="panel">
        <h3 className="h3-ic"><LineIcon name="megaphone" size={17} /> Announcements</h3>
        <AnnouncementForm onPost={(body) => act(() => api('/announcements', { method: 'POST', body: { batchId, ...body } }).then(loadAnnouncements), 'Announcement posted — students notified')} />
        {announcements.map((a) => (
          <div key={a._id} className="assignment">
            <div className="row"><strong>{a.title}</strong><span className="muted">{new Date(a.createdAt).toLocaleDateString()}</span></div>
            {a.body && <p className="muted" style={{ marginTop: 4 }}>{a.body}</p>}
          </div>
        ))}
        {announcements.length === 0 && <p className="muted">No announcements yet.</p>}
      </section>

      {/* Sessions — with Zoom link */}
      <section className="panel">
        <h3>Sessions & Zoom links</h3>
        <SessionForm onAdd={(body) => act(() => api('/sessions', { method: 'POST', body: { batchId, ...body } }).then(loadSessions), 'Session scheduled')} />
        <div className="session-list">
          {sessions.map((s) => {
            const d = new Date(s.startsAt);
            return (
              <div key={s._id} className="session-row">
                <div className="session-date">
                  <span className="session-date-d">{d.getDate()}</span>
                  <span className="session-date-m">{d.toLocaleString([], { month: 'short' })}</span>
                </div>
                <div className="session-info">
                  <strong>{s.title}</strong>
                  <div className="session-sub">
                    <span className="muted">{d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    {s.joinUrl
                      ? <a href={s.joinUrl} target="_blank" rel="noreferrer" className="zoom-link"><LineIcon name="video" size={14} /> Join Zoom</a>
                      : <span className="muted">No link yet</span>}
                  </div>
                </div>
                <Attendance session={s} students={batch.studentIds} onDone={() => flash('Attendance saved')} />
              </div>
            );
          })}
          {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
        </div>
      </section>

      {/* Assignments + grading */}
      <section className="panel">
        <h3>Assignments & Projects</h3>
        <AssignmentForm onAdd={(body) => act(() => api('/assignments', { method: 'POST', body: { batchId, ...body } }).then(loadAssignments), 'Assignment created')} />
        {assignments.map((a) => (
          <div key={a._id} className="assignment">
            <div className="assignment-head">
              <strong>{a.title}</strong>
              <span className={`badge ${a.type === 'project' ? 'badge-accent' : ''}`}>{a.type}</span>
              {a.startDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Opens {dueLabel(a.startDate)}</span>}
              {a.dueDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Due {dueLabel(a.dueDate)}</span>}
            </div>
            {(a.requiredDriveTypes || []).length > 0 && (
              <div className="assignment-reqs">
                <span className="muted">Requires in Drive folder:</span>
                {a.requiredDriveTypes.map((t) => (
                  <span key={t} className="badge badge-muted">{DRIVE_TYPES.find((d) => d.key === t)?.label || t}</span>
                ))}
              </div>
            )}
            {a.description && <div className="assignment-desc"><Markdown text={a.description} /></div>}
            <Submissions assignmentId={a._id} />
          </div>
        ))}
        {assignments.length === 0 && <p className="muted">No assignments yet.</p>}
      </section>

      {/* Quizzes & exams (admin authors + tracks results) */}
      <section className="panel">
        <h3>Quizzes & Exams</h3>
        <QuizBuilder onCreate={(body) => act(() => api('/quizzes', { method: 'POST', body: { batchId, ...body } }).then(loadQuizzes), 'Quiz posted')} />
        {quizzes.map((q) => (
          <div key={q._id} className="assignment">
            <div className="row"><strong>{q.title}</strong><span className="badge">{q.type}</span><span className="muted">{q.questions?.length || 0} questions</span></div>
            <QuizResults quizId={q._id} />
          </div>
        ))}
        {quizzes.length === 0 && <p className="muted">No quizzes yet.</p>}
      </section>

      {/* Gradebook — students × assessments matrix */}
      <section className="panel">
        <h3>Gradebook</h3>
        {!gradebook || gradebook.rows.length === 0 ? (
          <p className="muted">No students to grade yet.</p>
        ) : gradebook.columns.length === 0 ? (
          <p className="muted">No assignments or quizzes yet — add some above and grades will appear here.</p>
        ) : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {gradebook.columns.map((c) => <th scope="col" key={c.id} title={c.title}>{c.title.length > 14 ? c.title.slice(0, 13) + '…' : c.title}</th>)}
                  <th scope="col">Avg</th>
                </tr>
              </thead>
              <tbody>
                {gradebook.rows.map((r) => (
                  <tr key={r.studentId}>
                    <th scope="row" className="gb-rowhead">{r.name}</th>
                    {r.cells.map((cv, i) => (
                      <td key={gradebook.columns[i].id} className={`gb-cell gb-${cv.status}`}>
                        {cv.score == null
                          ? (cv.status === 'submitted' ? '•' : '—')
                          : (gradebook.columns[i].max ? `${cv.score}/${gradebook.columns[i].max}` : cv.score)}
                      </td>
                    ))}
                    <td><strong>{r.avgPct != null ? `${r.avgPct}%` : '—'}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Admin roster row: clickable identity + clearly-labeled actions, instead of
// cryptic chip glyphs. Blocked members are visually muted with an explicit badge.
function MemberRow({ user, kind, href, blocked, onToggleBlock, onRemove }) {
  const name = user.fullName || user.email;
  return (
    <div className={`member-row ${blocked ? 'is-blocked' : ''}`}>
      <span className="member-av">{name[0].toUpperCase()}</span>
      <div className="member-id">
        <Link className="member-name" to={href} title={`Open ${kind} profile`}>{name}</Link>
        <div className="member-tags">
          {user.blocked?.lms && <span className="badge badge-blocked">LMS blocked</span>}
          {blocked && <span className="badge badge-blocked">course blocked</span>}
        </div>
      </div>
      <div className="member-actions">
        <button type="button" className={`btn sm ${blocked ? 'ghost' : 'ghost-danger'}`} onClick={onToggleBlock}>
          {blocked ? 'Unblock course' : 'Block course'}
        </button>
        <button type="button" className="btn sm quiet" title="Remove from batch" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

function AnnouncementForm({ onPost }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onPost({ title, body }); setTitle(''); setBody(''); } }} style={{ marginBottom: 8 }}>
      <div className="inline-form">
        <input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
        <button className="btn sm">Post &amp; notify</button>
      </div>
      <input placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', marginTop: 8 }} className="ann-body" />
    </form>
  );
}

function SessionForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [zoomMeetingId, setZoomMeetingId] = useState('');
  return (
    <>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (title && startsAt) { onAdd({ title, startsAt: new Date(startsAt).toISOString(), joinUrl, zoomMeetingId }); setTitle(''); setStartsAt(''); setJoinUrl(''); setZoomMeetingId(''); } }}>
        <input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <DateTimePicker value={startsAt} onChange={setStartsAt} placeholder="Starts at" />
        <input placeholder="Zoom link (https://…)" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} />
        <input placeholder="Zoom meeting ID (optional)" value={zoomMeetingId} onChange={(e) => setZoomMeetingId(e.target.value)} />
        <button className="btn sm">Add session</button>
      </form>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Meeting ID auto-fills from a zoom.us/j/… link. For a registration link, paste the numeric Meeting ID so Zoom-join attendance can be matched.</p>
    </>
  );
}

// Quiz author: title/type + a growing list of questions, each with
// options and a "correct" radio.
function QuizBuilder({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('quiz');
  const blank = () => ({ text: '', options: ['', ''], correctIndex: 0, explanation: '' });
  const [questions, setQuestions] = useState([blank()]);

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (qi, oi, val) => setQ(qi, { options: questions[qi].options.map((o, idx) => (idx === oi ? val : o)) });
  const addOption = (qi) => setQ(qi, { options: [...questions[qi].options, ''] });
  const addQuestion = () => setQuestions((qs) => [...qs, blank()]);

  function submit(e) {
    e.preventDefault();
    const clean = questions
      .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((q) => q.text.trim() && q.options.length >= 2);
    if (!title.trim() || clean.length === 0) return;
    onCreate({ title, type, questions: clean });
    setTitle(''); setType('quiz'); setQuestions([blank()]); setOpen(false);
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New quiz / exam</button>;
  return (
    <form className="quiz-builder" onSubmit={submit}>
      <div className="inline-form">
        <input placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="quiz">Quiz</option><option value="exam">Exam</option></select>
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="quiz-q">
          <input placeholder={`Question ${qi + 1}`} value={q.text} onChange={(e) => setQ(qi, { text: e.target.value })} />
          {q.options.map((o, oi) => (
            <label key={oi} className="quiz-opt">
              <input type="radio" name={`correct-${qi}`} checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} />
              <input placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => setOpt(qi, oi, e.target.value)} />
            </label>
          ))}
          <button type="button" className="btn sm ghost" onClick={() => addOption(qi)}>+ option</button>
          <textarea
            className="quiz-why-input"
            rows={2}
            placeholder="Explanation (optional) — shown to students after they answer"
            value={q.explanation}
            onChange={(e) => setQ(qi, { explanation: e.target.value })}
          />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm ghost" onClick={addQuestion}>+ question</button>
        <button className="btn sm" type="submit">Post quiz</button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Tick the radio next to the correct option. Explanations appear in the student's answer review.</p>
    </form>
  );
}

function QuizResults({ quizId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => api(`/quizzes/${quizId}/results`).then(setData).catch(() => setData({ attempts: [] }));

  // Fetch on first open only — reopening reuses what we already have.
  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (!data) load();
  }

  const attempts = data?.attempts;
  return (
    <div className="subs">
      <button className="btn sm ghost" onClick={toggle}>
        {open ? 'Hide results' : 'View results'}
      </button>
      {open && (
        !data ? <p className="muted">Loading…</p> :
          attempts.length === 0 ? <p className="muted">No attempts yet.</p> :
            attempts.map((a) => (
              <div key={a._id} className="grade-row">
                <strong>{a.studentId?.fullName || a.studentId?.email}</strong>
                <span className="badge badge-student">{a.score}/{a.total ?? data.quiz?.total}</span>
              </div>
            ))
      )}
    </div>
  );
}

// What an admin can demand inside the student's Drive folder. Ticking 'html'
// also lifts the default block on HTML files for this assignment only.
export const DRIVE_TYPES = [
  { key: 'video', label: 'Video', hint: 'screen recording, demo' },
  { key: 'image', label: 'Photo / screenshot', hint: 'jpg, png' },
  { key: 'doc', label: 'Document', hint: 'PDF, Word, text file' },
  { key: 'slides', label: 'Slide deck', hint: 'PPT, Google Slides' },
  { key: 'html', label: 'HTML file', hint: 'blocked unless ticked' },
];

function AssignmentForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('assignment');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [required, setRequired] = useState(['video', 'image', 'doc']);
  const [err, setErr] = useState('');

  function reset() {
    setTitle(''); setType('assignment'); setDescription('');
    setStartDate(''); setDueDate(''); setRequired(['video', 'image', 'doc']);
    setErr(''); setOpen(false);
  }

  function toggleType(key) {
    setRequired((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      return setErr('The start date must be before the last date for submission.');
    }
    onAdd({
      title: title.trim(),
      type,
      description: description.trim(),
      startDate: startDate ? new Date(startDate).toISOString() : null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      requiredDriveTypes: required,
    });
    reset();
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New assignment</button>;

  return (
    <form className="af" onSubmit={submit}>
      <div className="af-top">
        <input className="af-title" placeholder={type === 'project' ? 'Project title' : 'Assignment title'} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="af-seg">
          <button type="button" className={type === 'assignment' ? 'on' : ''} onClick={() => setType('assignment')}>Assignment</button>
          <button type="button" className={type === 'project' ? 'on' : ''} onClick={() => setType('project')}>Project</button>
        </div>
      </div>

      <label className="af-label">Description &amp; instructions</label>
      <textarea
        className="af-desc"
        rows={6}
        placeholder={"Explain the task clearly:\n• What students need to do\n• Deliverables to submit (link, repo, doc…)\n• How it will be graded\n\nMarkdown supported — **bold**, - lists, `code`."}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="af-label">Required in the Drive folder</label>
      <p className="af-hint">
        The automated check rejects a submission whose folder is missing any ticked item.
        Untick everything to accept any files.
      </p>
      <div className="af-reqs">
        {DRIVE_TYPES.map((t) => (
          <label key={t.key} className={`af-req ${required.includes(t.key) ? 'on' : ''}`}>
            <input type="checkbox" checked={required.includes(t.key)} onChange={() => toggleType(t.key)} />
            <span>
              <strong>{t.label}</strong>
              <span className="muted"> · {t.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {err && <p className="sub-check-error">{err}</p>}

      <div className="af-foot">
        <label className="af-due">
          <span>Start date <span className="muted">(optional)</span></span>
          <DateTimePicker value={startDate} onChange={setStartDate} placeholder="Open immediately" />
        </label>
        <label className="af-due">
          <span>Last date to submit <span className="muted">(optional)</span></span>
          <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="No deadline" />
        </label>
        <div className="af-actions">
          <button type="button" className="btn ghost sm" onClick={reset}>Cancel</button>
          <button className="btn sm" disabled={!title.trim()}>Post {type}</button>
        </div>
      </div>
    </form>
  );
}

function Attendance({ session, students, onDone }) {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef(null);

  // Lock the page behind the modal so scrolling stays inside it, move focus in,
  // hand it back on close, and let Escape dismiss (unless a save is in flight).
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    const opener = document.activeElement;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !saving) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, saving]);

  async function openModal() {
    setOpen(true); setLoading(true);
    try {
      const { records } = await api(`/attendance/session/${session._id}`);
      const m = {};
      (records || []).forEach((r) => { m[r.studentId] = r.status === 'present'; });
      setMarks(m);
    } catch { setMarks({}); }
    finally { setLoading(false); }
  }
  const present = students.filter((s) => marks[s._id]).length;
  const set = (id, val) => setMarks((m) => ({ ...m, [id]: val }));
  const allPresent = () => setMarks(Object.fromEntries(students.map((s) => [s._id, true])));
  const clearAll = () => setMarks({});

  async function save() {
    setSaving(true);
    try {
      const records = students.map((s) => ({ studentId: s._id, status: marks[s._id] ? 'present' : 'absent' }));
      await api(`/attendance/session/${session._id}`, { method: 'POST', body: { records } });
      setOpen(false); onDone();
    } finally { setSaving(false); }
  }

  return (
    <>
      <button className="btn sm ghost" onClick={openModal}>Mark attendance</button>
      {open && (
        <div className="att-overlay" onClick={() => !saving && setOpen(false)}>
          <div className="att-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Attendance — ${session.title}`} onClick={(e) => e.stopPropagation()}>
            <div className="att-head">
              <div>
                <div className="att-kicker">Attendance</div>
                <div className="att-title">{session.title}</div>
                <div className="muted att-when">{new Date(session.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button className="att-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="att-toolbar">
              <div className="att-count"><strong>{present}</strong> <span className="muted">/ {students.length} present</span></div>
              <div className="att-quick">
                <button className="att-link" onClick={allPresent}>Mark all present</button>
                <button className="att-link" onClick={clearAll}>Clear</button>
              </div>
            </div>

            <div className="att-list">
              {loading ? <p className="muted att-empty">Loading…</p>
                : students.length === 0 ? <p className="muted att-empty">No students enrolled in this batch.</p>
                : students.map((s) => {
                  const p = !!marks[s._id];
                  return (
                    <div key={s._id} className={`att-item ${p ? 'is-present' : ''}`}>
                      <span className="att-av">{(s.fullName || s.email)[0].toUpperCase()}</span>
                      <span className="att-name">{s.fullName || s.email}</span>
                      <div className="att-seg">
                        <button className={`att-segbtn ${p ? 'on-p' : ''}`} onClick={() => set(s._id, true)}>Present</button>
                        <button className={`att-segbtn ${!p ? 'on-a' : ''}`} onClick={() => set(s._id, false)}>Absent</button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="att-foot">
              <button className="btn ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn" onClick={save} disabled={saving || loading || students.length === 0}>{saving ? 'Saving…' : 'Save attendance'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Submissions({ assignmentId }) {
  const [subs, setSubs] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => api(`/submissions/assignment/${assignmentId}`).then((d) => setSubs(d.submissions || [])).catch(() => setSubs([]));
  async function grade(id, score, feedback) { await api(`/submissions/${id}/grade`, { method: 'PATCH', body: { score, feedback } }); load(); }
  async function recheck(id) { await api(`/submissions/${id}/recheck`, { method: 'POST' }); load(); }
  async function unlock(id) { await api(`/submissions/${id}/unlock`, { method: 'POST' }); load(); }

  // Fetch on first open only — reopening reuses what we already have.
  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (subs === null) load();
  }

  return (
    <div className="subs">
      <button className="btn sm ghost" onClick={toggle}>
        {open ? 'Hide submissions' : 'View submissions'}
      </button>
      {open && (
        subs === null ? <p className="muted">Loading…</p> :
          subs.length === 0 ? <p className="muted">No submissions yet.</p> :
            subs.map((s) => <GradeRow key={s._id} sub={s} onGrade={grade} onRecheck={recheck} onUnlock={unlock} />)
      )}
    </div>
  );
}

function GradeRow({ sub, onGrade, onRecheck, onUnlock }) {
  const [score, setScore] = useState(sub.score ?? '');
  const [feedback, setFeedback] = useState(sub.feedback || '');
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);

  async function recheck() {
    setBusy(true);
    try { await onRecheck(sub._id); } finally { setBusy(false); }
  }

  // Grading writes a score — guard against a double-click posting it twice.
  async function grade() {
    if (grading) return;
    setGrading(true);
    try { await onGrade(sub._id, score, feedback); } finally { setGrading(false); }
  }

  return (
    <div className="grade-row-stack">
      <div className="grade-row-top">
        <strong>{sub.studentId?.fullName || sub.studentId?.email}</strong>
        <span className={`badge ${sub.status === 'graded' ? 'badge-student' : sub.status === 'submitted' ? 'badge-submitted' : ''}`}>{sub.status}</span>
      </div>

      {/* Drive verification — its own block, independent of the grade below. */}
      <SubmissionCheckPanel
        submission={{ ...sub, driveLink: sub.driveLink || sub.url }}
        onRecheck={recheck}
        busy={busy}
      />

      <div className="inline-form">
        {sub.locked && <button type="button" className="btn sm ghost" onClick={() => onUnlock(sub._id)}>Unlock</button>}
        <select className="grade-score" value={score} onChange={(e) => setScore(e.target.value)}>
          <option value="">Score…</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} / 10</option>)}
        </select>
        <input placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn sm" onClick={grade} disabled={grading}>{grading ? 'Saving…' : 'Grade'}</button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import LineIcon from './LineIcon.jsx';
import Markdown from './Markdown.jsx';
import { SubmissionCheckPanel } from './SubmissionCheck.jsx';
import { DRIVE_TYPES } from './CourseWork.jsx';

const dueLabel = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// The admin's batch detail: enrol students, set assignments, author quizzes
// and grade. With only two roles there is no
// second view of this screen, so there is no mode to switch on.
export default function BatchWorkspace({ batchId }) {
  const [batch, setBatch] = useState(null);
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
  const loadAssignments = () => api(`/assignments?batchId=${batchId}`).then((d) => setAssignments(d.assignments || [])).catch(() => {});
  const loadQuizzes = () => api(`/quizzes?batchId=${batchId}`).then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
  const loadPeople = () => {
    api('/users?role=student').then((d) => setAllStudents(d.users || [])).catch(() => {});
  };
  const loadAnnouncements = () => api(`/announcements?batchId=${batchId}`).then((d) => setAnnouncements(d.announcements || [])).catch(() => {});
  const loadGradebook = () => api(`/grades/batch/${batchId}`).then(setGradebook).catch(() => setGradebook(null));
  useEffect(() => { loadBatch(); loadAssignments(); loadQuizzes(); loadAnnouncements(); loadGradebook(); }, [batchId]);
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

      {/* Assignments + grading */}
      <section className="panel">
        <h3>Assignments &amp; Projects</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
          Grade what students hand in. Create and edit the work itself under <b>Programs → Manage curriculum → Projects &amp; assignments</b>.
        </p>
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
        <h3>Quizzes &amp; Exams</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
          Results only. Write and edit quizzes under <b>Programs → Manage curriculum → Quizzes</b>.
        </p>
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

// Quiz author: title/type + a growing list of questions, each with
// options and a "correct" radio.
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


// The picker speaks 'YYYY-MM-DDTHH:mm' in local time; the API stores ISO.
const toPickerValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// One form, two jobs: posting a new assignment/project and editing an existing
// one. Pass `initial` to edit — the form opens prefilled and stays open, the
// same way the curriculum editor edits a lesson in place.
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

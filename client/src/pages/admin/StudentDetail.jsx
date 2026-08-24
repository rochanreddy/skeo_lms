import { useEffect, useState } from 'react';
import { useParams, Link, useOutletContext } from 'react-router-dom';
import { api, downloadFile } from '../../api.js';
import { Donut, Meter, SEQ, SEQ_AQUA } from '../../components/Charts.jsx';
import { CheckBadge, SubmissionCheckPanel } from '../../components/SubmissionCheck.jsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Drill-down into one student: profile, every batch, every
// assignment/project with submission state, quiz attempts, lesson progress.
// Admin additionally gets the block controls (whole LMS / course / module /
// item) and password reset.
// in the course, plus the CSV report.
export default function StudentDetail() {
  const { id } = useParams();
  const { user: viewer } = useOutletContext();
  const isAdmin = viewer.role === 'admin';
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [openSub, setOpenSub] = useState(null); // assignment id whose check detail is expanded
  const [rechecking, setRechecking] = useState(null);

  const load = () => api(`/users/${id}/overview`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  async function recheck(submissionId) {
    setErr('');
    setRechecking(submissionId);
    try { await api(`/submissions/${submissionId}/recheck`, { method: 'POST' }); await load(); flash('Re-checked'); }
    catch (e) { setErr(e.message); }
    finally { setRechecking(null); }
  }

  async function setBlocks(body, okMsg) {
    setErr('');
    try { await api(`/users/${id}/blocks`, { method: 'PATCH', body }); await load(); flash(okMsg); }
    catch (e) { setErr(e.message); }
  }

  async function toggleLms() {
    const isBlocked = data.user.blocked?.lms;
    if (isBlocked) return setBlocks({ lms: false, reason: '' }, 'Account unblocked');
    const reason = window.prompt('Block this student from the entire LMS?\nOptional reason (shown to the student):') ;
    if (reason === null) return;
    return setBlocks({ lms: true, reason }, 'Account blocked');
  }

  function toggleBatch(batchId, blocked) {
    const ids = new Set(data.user.blocked?.batch_ids || []);
    if (blocked) ids.delete(String(batchId)); else ids.add(String(batchId));
    return setBlocks({ batchIds: [...ids] }, blocked ? 'Course unblocked' : 'Course blocked');
  }

  function toggleAssignment(assignmentId, blocked) {
    const ids = new Set(data.user.blocked?.assignment_ids || []);
    if (blocked) ids.delete(String(assignmentId)); else ids.add(String(assignmentId));
    return setBlocks({ assignmentIds: [...ids] }, blocked ? 'Unblocked' : 'Blocked');
  }

  function toggleModule(moduleId, blocked) {
    const ids = new Set(data.user.blocked?.module_ids || []);
    if (blocked) ids.delete(String(moduleId)); else ids.add(String(moduleId));
    return setBlocks({ moduleIds: [...ids] }, blocked ? 'Module unblocked' : 'Module blocked');
  }

  async function resetPassword() {
    if (!window.confirm(`Reset password for ${data.user.email}?`)) return;
    try {
      const r = await api(`/users/${id}/reset-password`, { method: 'POST' });
      window.alert(`New temp password for ${data.user.email}: ${r.tempPassword}`);
    } catch (e) { setErr(e.message); }
  }

  if (err && !data) return <p className="error">{err}</p>;
  if (!data) return <div className="skeleton"><div className="skeleton-row" /><div className="skeleton-row tall" /><div className="skeleton-row tall" /></div>;

  const u = data.user;
  const lmsBlocked = u.blocked?.lms;
  const subs = data.assignments.filter((a) => a.submission);
  const graded = subs.filter((a) => a.submission.status === 'graded');
  const gradedScores = graded.filter((a) => a.submission.score != null);
  const avgScore = gradedScores.length ? (gradedScores.reduce((n, a) => n + a.submission.score, 0) / gradedScores.length).toFixed(1) : null;
  const quizAvg = data.quizAttempts.length
    ? Math.round(data.quizAttempts.reduce((n, q) => n + (q.total ? (q.score / q.total) * 100 : 0), 0) / data.quizAttempts.length)
    : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/app/students" className="crumb">← All students</Link>
          <h1 style={{ marginTop: 4 }}>
            {u.full_name || u.email}
            {isAdmin && lmsBlocked && <span className="badge badge-blocked" style={{ marginLeft: 10 }}>blocked</span>}
          </h1>
          <p className="muted">{u.email}{u.phone ? ` · ${u.phone}` : ''} · joined {fmtDate(u.created_at)} · last active {fmtDate(u.last_active_at)}</p>
        </div>
        <div className="row">
          {msg && <span className="ws-flash">{msg}</span>}
          <button className="btn sm ghost" onClick={() => downloadFile(`/reports/student/${id}`)}>Download report (CSV)</button>
          {isAdmin && <button className="btn sm ghost" onClick={resetPassword}>Reset password</button>}
          {isAdmin && (
            <button className={`btn sm ${lmsBlocked ? '' : 'danger'}`} onClick={toggleLms}>
              {lmsBlocked ? 'Unblock LMS access' : 'Block LMS access'}
            </button>
          )}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {isAdmin && lmsBlocked && (
        <div className="blockbox">
          This student is blocked from the entire LMS{u.blocked.reason ? ` — “${u.blocked.reason}”` : ''}. They cannot log in or use any feature until unblocked.
        </div>
      )}

      {/* Analytics row */}
      <div className="detail-charts">
        <div className="panel chart-card">
          <div className="eyebrow">Assignments &amp; projects</div>
          <Donut
            data={[
              { label: 'Graded', value: graded.length, color: SEQ.main },
              { label: 'Submitted', value: subs.length - graded.length, color: SEQ.light },
              { label: 'Not submitted', value: data.assignments.length - subs.length, color: '#eceaf1' },
            ]}
            centerLabel={`${subs.length}/${data.assignments.length}`}
            centerSub="submitted"
          />
        </div>
        <div className="panel chart-card">
          <div className="eyebrow">Performance</div>
          <div className="perf-stats">
            <div><div className="stat-label">Avg assignment score</div><div className="perf-num">{avgScore ?? '—'}{avgScore != null && <span className="perf-sub">/10</span>}</div></div>
            <div><div className="stat-label">Quiz average</div><div className="perf-num">{quizAvg == null ? '—' : `${quizAvg}%`}</div></div>
            <div><div className="stat-label">Quizzes taken</div><div className="perf-num">{data.quizAttempts.length}</div></div>
          </div>
        </div>
      </div>

      {/* Course progress */}
      {data.progress.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3>Course progress</h3>
          {data.progress.map((p) => (
            <div key={p.programId} className="prog-row">
              <span className="prog-name">{p.title}</span>
              <Meter pct={p.pct} />
              <span className="muted" style={{ fontSize: 13 }}>{p.done}{p.total ? `/${p.total}` : ''} lessons</span>
            </div>
          ))}
        </section>
      )}

      {/* Course — with a per-student block */}
      <section className="panel" style={{ marginTop: 18 }}>
        <h3>Course</h3>
        {data.batches.length === 0 && <p className="muted">Not enrolled yet.</p>}
        {data.batches.map((b) => (
          <div key={b.id} className={`detail-row ${b.blocked ? 'is-blocked' : ''}`}>
            <div>
              <strong>{b.name}</strong> {b.blocked && <span className="badge badge-blocked">course blocked</span>}
              <div className="muted">{b.program} · {b.status}</div>
            </div>
            {isAdmin && (
              <button className={`btn sm ${b.blocked ? 'ghost' : 'danger ghost-danger'}`} onClick={() => toggleBatch(b.id, b.blocked)}>
                {b.blocked ? 'Unblock course' : 'Block course'}
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Curriculum modules — with per-module block (admin only) */}
      {isAdmin && (data.modules || []).length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3>Curriculum modules</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Block a module to hide it from this student's Learning page.</p>
          {data.modules.map((m) => (
            <div key={m.id} className={`detail-row ${m.blocked ? 'is-blocked' : ''}`}>
              <div>
                <strong>{m.title}</strong> {m.blocked && <span className="badge badge-blocked">module blocked</span>}
                <div className="muted">{m.program} · {m.lessons} lesson{m.lessons === 1 ? '' : 's'}</div>
              </div>
              <button className={`btn sm ${m.blocked ? 'ghost' : 'danger ghost-danger'}`} onClick={() => toggleModule(m.id, m.blocked)}>
                {m.blocked ? 'Unblock module' : 'Block module'}
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Assignments & projects — with per-item block */}
      <section className="panel" style={{ marginTop: 18 }}>
        <h3>Assignments &amp; projects</h3>
        {data.assignments.length === 0 && <p className="muted">No assignments in their batches yet.</p>}
        {data.assignments.length > 0 && (
          <div className="table-wrap">
            <table className="grade-table">
              <thead>
                <tr><th>Title</th><th>Type</th><th>Batch</th><th>Due</th><th>Status</th><th>Drive check</th><th>Score</th>{isAdmin && <th></th>}</tr>
              </thead>
              <tbody>
                {data.assignments.map((a) => {
                  const s = a.submission;
                  const cols = isAdmin ? 8 : 7;
                  const expanded = openSub === a.id;
                  return [
                    <tr key={a.id} className={a.blocked ? 'row-blocked' : ''}>
                      <td>{a.title} {a.blocked && isAdmin && <span className="badge badge-blocked">blocked</span>}</td>
                      <td><span className={`badge ${a.type === 'project' ? 'badge-accent' : ''}`}>{a.type}</span></td>
                      <td>{a.batchName}</td>
                      <td>{a.dueDate ? fmtDate(a.dueDate) : '—'}</td>
                      <td>{s ? s.status : 'not submitted'}</td>
                      <td>
                        {s ? (
                          <div className="sub-cell">
                            {/* Always clickable, whatever the check said — an admin
                                must be able to open the folder and judge for themselves. */}
                            {s.driveLink
                              ? <a href={s.driveLink} target="_blank" rel="noreferrer">Drive folder</a>
                              : <span className="muted">no link</span>}
                            <CheckBadge status={s.checkStatus} />
                            {s.checkStatus && (
                              <button className="btn sm ghost" onClick={() => setOpenSub(expanded ? null : a.id)}>
                                {expanded ? 'Hide' : 'Details'}
                              </button>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td>{s?.score ?? '—'}</td>
                      {isAdmin && (
                        <td>
                          <button className="btn sm ghost" onClick={() => toggleAssignment(a.id, a.blocked)}>
                            {a.blocked ? 'Unblock' : 'Block'}
                          </button>
                        </td>
                      )}
                    </tr>,
                    expanded && s ? (
                      <tr key={`${a.id}-detail`} className="sub-detail-row">
                        <td colSpan={cols}>
                          <SubmissionCheckPanel
                            submission={s}
                            onRecheck={s.id ? () => recheck(s.id) : null}
                            busy={rechecking === s.id}
                          />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quiz attempts */}
      <section className="panel" style={{ marginTop: 18 }}>
        <h3>Quiz &amp; exam attempts</h3>
        {data.quizAttempts.length === 0 ? <p className="muted">No attempts yet.</p> : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead><tr><th>Quiz</th><th>Type</th><th>Batch</th><th>Score</th><th>Taken</th></tr></thead>
              <tbody>
                {data.quizAttempts.map((q) => (
                  <tr key={q.id}>
                    <td>{q.quiz}</td>
                    <td><span className="badge">{q.type}</span></td>
                    <td>{q.batchName}</td>
                    <td><strong>{q.score}/{q.total}</strong></td>
                    <td>{fmtDate(q.at)}</td>
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

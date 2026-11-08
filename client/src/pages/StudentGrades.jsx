import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Student gradebook: one consolidated view of every assignment/quiz/exam and
// the grade received: the single place a student checks "how am I doing".
// Lives as the Grades tab inside Learning (`embedded`: the page there already
// has its heading, so this one drops its own).
export default function StudentGrades({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, graded: 0, avgPct: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/grades/me').then((d) => { setRows(d.rows || []); setSummary(d.summary || {}); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // The right-hand column: a score once graded, a waiting pill once handed
  // in, and nothing at all before that, a dash is not information.
  const score = (r) => {
    if (r.status === 'graded' && r.score != null) {
      return r.max
        ? <><strong>{r.score}/{r.max}</strong><small>{Math.round((r.score / r.max) * 100)}%</small></>
        : <strong>{r.score}</strong>;
    }
    if (r.status === 'submitted') return <span className="gr-wait">Awaiting grade</span>;
    return null;
  };
  const statusLabel = (r) => (r.status === 'graded' ? 'Graded' : r.status === 'submitted' ? 'Submitted' : 'Pending');

  return (
    <div className="grades-page">
      {embedded ? (
        <p className="muted gr-intro">Every assessment and the grade you earned, in one place.</p>
      ) : (
        <div className="page-head">
          <div>
            <div className="eyebrow">Student board</div>
            <h1>My grades</h1>
            <p>Every assessment and the grade you earned, in one place.</p>
          </div>
        </div>
      )}

      <div className="tiles gr-tiles">
        <div className="tile">
          <div className={`tile-value ${summary.avgPct == null ? 'is-empty' : ''}`}>{summary.avgPct != null ? `${summary.avgPct}%` : 'No grades yet'}</div>
          <div className="tile-label">Average score</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.graded}<span className="tile-of">/{summary.total}</span></div>
          <div className="tile-label">Graded</div>
        </div>
      </div>

      <div className="panel gr-panel">
        {loading ? <p className="muted gr-note">Loading…</p> : rows.length === 0 ? (
          <p className="muted gr-note">No assessments yet: assignments and quizzes appear here once they're posted.</p>
        ) : (
          <ul className="gr-list">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`} className={`gr-row is-${r.status}`}>
                <div className="gr-main">
                  <div className="gr-title">{r.title}</div>
                  <div className="gr-meta">
                    <span className={`gr-kind gt-${String(r.kind).toLowerCase()}`}>{r.kind}</span>
                    <span className={`gr-status gt-${r.status}`}>{statusLabel(r)}</span>
                  </div>
                  {r.feedback && <p className="gr-feedback">“{r.feedback}”</p>}
                </div>
                <div className="gr-score">{score(r)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

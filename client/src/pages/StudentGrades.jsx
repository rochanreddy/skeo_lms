import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Student gradebook: every assignment, project and quiz with the grade
// received, the one place a student checks "how am I doing". Laid out like
// the menler LMS gradebook: two summary tiles, then one table, one row per
// assessment, in course order (the server sorts it).
//
// Lives as the Grades tab inside Learning (`embedded`: the page there already
// has its heading, so this one drops its own).
export default function StudentGrades({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, graded: 0, avgPct: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/grades/me').then((d) => { setRows(d.rows || []); setSummary(d.summary || {}); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const scoreCell = (r) => {
    if (r.status === 'graded' && r.score != null) {
      return r.max
        ? <strong>{r.score}/{r.max} <span className="gt-pct">· {Math.round((r.score / r.max) * 100)}%</span></strong>
        : <strong>{r.score}</strong>;
    }
    return <span className="gt-dash">{r.status === 'submitted' ? 'Awaiting grade' : '-'}</span>;
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

      <div className="gr-tiles">
        <div className="tile">
          <div className="tile-value">{summary.avgPct != null ? `${summary.avgPct}%` : '-'}</div>
          <div className="tile-label">Average score</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.graded}/{summary.total}</div>
          <div className="tile-label">Graded</div>
        </div>
      </div>

      <div className="panel gr-panel">
        {loading ? (
          <p className="muted gr-note">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted gr-note">No assessments yet. Assignments, projects and quizzes appear here once they're posted, with every score you're given.</p>
        ) : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead>
                <tr><th>Assessment</th><th>Type</th><th>Status</th><th>Score</th><th>Feedback</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="gt-title">{r.title}</td>
                    <td className="gt-type"><span className={`gt-kind gt-${String(r.kind).toLowerCase()}`}>{r.kind}</span></td>
                    <td className="gt-st"><span className={`gt-status gt-${r.status}`}>{statusLabel(r)}</span></td>
                    <td className="gt-score">{scoreCell(r)}</td>
                    <td className={`gt-feedback ${r.feedback ? '' : 'is-empty'}`}>{r.feedback || <span className="gt-dash">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

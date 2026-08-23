import { useEffect, useState } from 'react';
import { api } from '../api.js';
import LineIcon from './LineIcon.jsx';

// "Needs attention" — students the scorer flagged as falling behind, worst
// first, with the reasons that triggered the flag. Pass a batchId to scope it to
// one cohort; omit it for every batch the viewer teaches.
export default function AtRiskPanel({ batchId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/stats/at-risk${batchId ? `?batchId=${batchId}` : ''}`)
      .then(setData)
      .catch(() => setData({ students: [], scanned: 0, failed: true }));
  }, [batchId]);

  const students = data?.students || [];
  const high = students.filter((s) => s.level === 'high').length;

  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <LineIcon name="alert" size={14} /> Needs attention
      </div>
      <h2>
        {students.length === 0 ? 'Students at risk' : `${students.length} student${students.length === 1 ? '' : 's'} falling behind`}
        {high > 0 && <span className="risk-count-high"> · {high} urgent</span>}
      </h2>

      {data === null && <p className="muted" style={{ marginTop: 12 }}>Checking engagement signals…</p>}

      {data?.failed && <p className="muted" style={{ marginTop: 12 }}>Couldn't load risk signals just now.</p>}

      {data && !data.failed && students.length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          {data.scanned === 0
            ? 'No students enrolled yet.'
            : `Everyone's on track — all ${data.scanned} student${data.scanned === 1 ? '' : 's'} look healthy.`}
        </p>
      )}

      {students.length > 0 && (
        <div className="risk-list">
          {students.map((s) => (
            <div key={`${s.id}-${s.batch.id}`} className={`risk-row ${s.level}`}>
              <div className="risk-main">
                <div className="risk-who">
                  <span className={`risk-dot ${s.level}`} />
                  <strong>{s.name}</strong>
                  <span className="muted risk-batch">{s.batch.name}</span>
                </div>
                <div className="risk-reasons">
                  {s.reasons.map((r) => (
                    <span className="risk-chip" key={r.label + r.detail}>
                      <b>{r.label}</b> {r.detail}
                    </span>
                  ))}
                </div>
              </div>
              <a className="btn sm ghost" href={`mailto:${s.email}`}>Reach out</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

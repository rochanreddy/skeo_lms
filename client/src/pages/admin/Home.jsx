import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../api.js';
import AtRiskPanel from '../../components/AtRiskPanel.jsx';
import { Donut, MiniLine, SEQ } from '../../components/Charts.jsx';

// Admin platform overview — headline counts, distribution donuts, signup trend,
// students-per-batch bars, at-risk panel, and the platform CSV report.
export default function AdminHome() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/stats/admin-dashboard').then(setData).catch(() => {}); }, []);

  const s = data?.stats || {};
  const cards = [
    { label: 'Students', value: s.students ?? '—' },
    { label: 'Projects', value: s.assignments ?? '—' },
    { label: 'Quizzes', value: s.quizzes ?? '—' },
  ];
  const chart = (data?.perBatch || []).filter((b) => b.count > 0);
  const max = Math.max(1, ...chart.map((b) => b.count));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <p className="greet">Everything, at a glance.</p>
          <p>What's happening across Skeo LMS right now.</p>
        </div>
        <button className="btn sm ghost" onClick={() => downloadFile('/reports/platform')}>Platform report (CSV)</button>
      </div>

      <div className="stats">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
          </div>
        ))}
      </div>

      {(s.blockedUsers ?? 0) > 0 && (
        <div className="blockbox" style={{ marginBottom: 18 }}>
          {s.blockedUsers} account{s.blockedUsers === 1 ? ' is' : 's are'} currently blocked from the LMS.
        </div>
      )}

      {data && (
        <div className="detail-charts">
          <div className="panel chart-card">
            <div className="eyebrow">Submissions</div>
            <Donut
              data={[
                { label: 'Graded', value: data.submissionStatus[0].count, color: SEQ.main },
                { label: 'Awaiting review', value: data.submissionStatus[1].count, color: SEQ.light },
              ]}
              centerSub="submissions"
            />
          </div>
          <div className="panel chart-card">
            <div className="eyebrow">Student signups — last 8 weeks</div>
            <MiniLine points={data.signups} />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {data.assignmentTypes[0].count} assignments · {data.assignmentTypes[1].count} projects in the course
            </div>
          </div>
        </div>
      )}

      <AtRiskPanel />

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Enrolment by batch</div>
        <h2>Students per cohort</h2>
        {chart.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>No enrolments yet.</p>
        ) : (
          <div className="chart" style={{ marginTop: 22 }}>
            {chart.map((b) => (
              <div className="bar-col" key={b.name}>
                <div className="bar-val">{b.count}</div>
                <div className="bar" style={{ height: `${Math.round((b.count / max) * 100)}%` }} />
                <div className="bar-name">{b.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

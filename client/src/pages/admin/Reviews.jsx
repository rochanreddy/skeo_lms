import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';

// Admin: every student review. Averages for the number questions on top,
// then each review with its answers, newest first. CSV for a spreadsheet.
export default function AdminReviews() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api('/reviews').then(setData).catch(() => setFailed(true));
  }, []);

  const reviews = data?.reviews || [];
  const questions = data?.questions || [];

  // Average per number question, over everyone who answered it.
  const averages = useMemo(() => questions
    .filter((q) => q.type === 'rating' || q.type === 'scale')
    .map((q) => {
      const vals = reviews.map((r) => r.answers.find((a) => a.questionId === q.id)?.value).filter((v) => typeof v === 'number');
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      return { q, avg, n: vals.length, max: q.type === 'rating' ? 5 : 10 };
    }), [reviews, questions]);

  function downloadCsv() {
    // Columns: who, when, then every question that appears in any review,
    // current ones first, retired ones after.
    const cols = [...questions.map((q) => ({ id: q.id, label: q.label }))];
    for (const r of reviews) {
      for (const a of r.answers) if (!cols.some((c) => c.id === a.questionId)) cols.push({ id: a.questionId, label: a.question || a.questionId });
    }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Name', 'Email', 'Date', ...cols.map((c) => c.label)],
      ...reviews.map((r) => [
        r.userId?.fullName || '',
        r.userId?.email || '',
        new Date(r.updatedAt).toISOString().slice(0, 10),
        ...cols.map((c) => r.answers.find((a) => a.questionId === c.id)?.value ?? ''),
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `skeo-reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <p className="greet">Reviews</p>
          <p>What students said about the programme.</p>
        </div>
        {reviews.length > 0 && <button className="btn sm ghost" onClick={downloadCsv}>Download CSV</button>}
      </div>

      {failed ? (
        <p className="muted">Reviews didn't load. Refresh to try again.</p>
      ) : !data ? (
        <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Reviews</div>
              <div className="stat-value">{reviews.length}</div>
            </div>
            {averages.map(({ q, avg, n, max }) => (
              <div className="stat" key={q.id} title={q.label}>
                <div className="stat-label">{q.label}</div>
                <div className="stat-value">{avg == null ? '-' : avg.toFixed(1)}<small className="rv-of">/{max}</small></div>
                <div className="muted rv-n">{n} answer{n === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>

          {reviews.length === 0 ? (
            <div className="panel"><p className="muted" style={{ margin: 0 }}>No reviews yet. They appear here as students submit them from their Review tab.</p></div>
          ) : (
            <div className="rv-list">
              {reviews.map((r) => (
                <article className="panel rv-card" key={r._id}>
                  <header className="rv-card-head">
                    <div>
                      <strong>{r.userId?.fullName || r.userId?.email || 'Former student'}</strong>
                      {r.userId?.fullName && <span className="muted"> · {r.userId.email}</span>}
                    </div>
                    <span className="muted rv-date">{new Date(r.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </header>
                  <dl className="rv-answers">
                    {r.answers.map((a) => (
                      <div key={a.questionId}>
                        <dt>{a.question || a.questionId}</dt>
                        <dd>
                          {a.type === 'rating'
                            ? <span className="rv-stars-read" aria-label={`${a.value} of 5`}>{'★'.repeat(a.value)}<span>{'★'.repeat(5 - a.value)}</span></span>
                            : a.type === 'scale' ? <strong>{a.value}<span className="muted">/10</span></strong>
                            : a.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

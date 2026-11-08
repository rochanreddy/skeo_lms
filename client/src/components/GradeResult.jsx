// How an AI-graded submission reads: the score, the feedback, and the rubric
// breakdown behind it. The student sees <GradeCard>; admins see
// <AiReviewPanel>, which adds what the grader could open and a re-run button.
// The grading itself lives on the server: utils/aiGrader.js.

const MAX_ATTEMPTS = 3; // mirrors the server's retry limit

/** Where a submission stands with the AI grader. */
export function gradeState(sub) {
  if (!sub) return 'none';
  if (sub.status === 'graded') return 'graded';
  const r = sub.aiReview;
  if (sub.checkStatus !== 'READY' || !r) return 'none';
  if (r.status === 'pending' || (r.status === 'failed' && (r.attempts || 0) < MAX_ATTEMPTS)) return 'grading';
  if (r.status === 'failed') return 'stuck';
  return 'none';
}

const unreadable = (review) => (review?.files || []).filter((f) => /^unreadable|^not opened/.test(f.read || ''));

function CriteriaList({ criteria }) {
  if (!criteria?.length) return null;
  return (
    <ul className="gc-crit">
      {criteria.map((c) => (
        <li key={c.id || c.name}>
          <div className="gc-crit-row">
            <span className="gc-crit-name">{c.name}</span>
            <span className="gc-crit-score">{c.score}<span>/{c.max}</span></span>
          </div>
          <div className="gc-bar" aria-hidden="true"><i style={{ width: `${c.max ? (c.score / c.max) * 100 : 0}%` }} /></div>
          {c.note && <p className="gc-crit-note">{c.note}</p>}
        </li>
      ))}
    </ul>
  );
}

function Skipped({ files }) {
  if (!files.length) return null;
  return (
    <div className="gc-skipped">
      <span>Not reviewed</span>
      <ul>{files.map((f) => <li key={f.name}><b>{f.name}</b> · {f.read.replace(/^unreadable: |^not opened: /, '')}</li>)}</ul>
    </div>
  );
}

/** The student's view, at the top of the submission box. */
export function GradeCard({ sub }) {
  const state = gradeState(sub);
  const review = sub?.aiReview;

  if (state === 'grading') {
    return (
      <div className="gc gc-pending" role="status">
        <span className="gc-spin" aria-hidden="true" />
        <div>
          <strong>Grading your work…</strong>
          <p>Your score and feedback usually arrive within a few minutes. You can leave this page; we’ll notify you.</p>
        </div>
      </div>
    );
  }

  if (state === 'stuck') {
    return (
      <div className="gc gc-stuck">
        <strong>We couldn’t grade this automatically</strong>
        <p>Check that your files are PDF, Word, PowerPoint, Google Docs or Slides, images or HTML, then resubmit.</p>
        <Skipped files={unreadable(review)} />
      </div>
    );
  }

  if (state !== 'graded') return null;
  const byAi = sub.gradedBy === 'ai' || (!sub.gradedBy && review?.status === 'done');
  return (
    <div className="gc">
      <div className="gc-top">
        <div className="gc-score" aria-label={`Score ${sub.score ?? '-'} out of 10`}>
          <span className="gc-num">{sub.score ?? '-'}</span><span className="gc-of">/10</span>
        </div>
        <div className="gc-head">
          <strong>Graded</strong>
          <span>{byAi ? 'Reviewed by AI against the rubric' : 'Reviewed by the skeo team'}</span>
        </div>
      </div>
      {sub.feedback && <p className="gc-feedback">{sub.feedback}</p>}
      {byAi && <CriteriaList criteria={review?.criteria} />}
      {byAi && <Skipped files={unreadable(review)} />}
      {byAi && !sub.locked && (
        <p className="gc-again">Want a higher score? Improve the files in your folder and press <b>Resubmit</b>. It will be graded again.</p>
      )}
    </div>
  );
}

const ago = (d) => {
  if (!d) return '';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/** The admin's view: everything the student sees, plus the run's details. */
export function AiReviewPanel({ sub, onRerun, busy = false }) {
  const review = sub?.aiReview;
  if (!sub || (!review && sub.checkStatus !== 'READY')) return null;

  let line;
  if (!review) line = <span className="muted">Not graded by AI yet.</span>;
  else if (review.status === 'pending') line = <span className="badge badge-submitted">AI grading…</span>;
  else if (review.status === 'failed') {
    line = (
      <>
        <span className="badge badge-blocked">AI review failed</span>
        <span className="muted">{review.attempts || 0}/{MAX_ATTEMPTS} tries · {review.error}</span>
      </>
    );
  } else {
    line = (
      <>
        <span className="badge badge-student">AI · {review.score}/10</span>
        <span className="muted">{review.rubric} · {ago(review.reviewedAt)}</span>
        {sub.gradedBy === 'admin' && <span className="badge">overridden by admin: {sub.score}/10</span>}
      </>
    );
  }

  return (
    <div className="air">
      <div className="air-head">
        {line}
        {onRerun && sub.checkStatus === 'READY' && review?.status !== 'pending' && (
          <button type="button" className="btn sm ghost" onClick={onRerun} disabled={busy}>
            {busy ? 'Queuing…' : review ? 'Re-run AI review' : 'Grade with AI'}
          </button>
        )}
      </div>
      {review?.status === 'done' && (
        <>
          {review.feedback && <p className="air-feedback">{review.feedback}</p>}
          <CriteriaList criteria={review.criteria} />
        </>
      )}
      {review?.files?.length > 0 && (
        <details className="air-files">
          <summary>Files the grader opened ({review.files.length})</summary>
          <ul>{review.files.map((f) => <li key={f.name}><b>{f.name}</b> · {f.read}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

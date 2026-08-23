// Shared UI for the Drive-folder verification layer of a submission.
//
// This is deliberately separate from the grading UI (score/feedback): a
// submission can be READY but ungraded, or graded despite NEEDS_FIXES if a
// an admin overrode the automated check by opening the folder themselves.
// Keep the two concerns in separate components so a later automated-review
// layer can slot in beside them without disturbing either.

const CHECK_LABELS = {
  PENDING_CHECK: 'Checking…',
  READY: 'Ready',
  NEEDS_FIXES: 'Needs fixes',
  CHECK_FAILED: 'Check failed',
};

// Student-facing wording — CHECK_FAILED is our fault, not theirs, so it must
// never read as something the student has to go fix.
const CHECK_LABELS_STUDENT = {
  ...CHECK_LABELS,
  CHECK_FAILED: 'Check pending — we’ll retry',
};

const badgeTone = (status) => {
  if (status === 'READY') return 'badge-student';
  if (status === 'PENDING_CHECK') return '';
  return 'badge-blocked';
};

export function CheckBadge({ status, audience = 'staff' }) {
  if (!status) return null;
  const labels = audience === 'student' ? CHECK_LABELS_STUDENT : CHECK_LABELS;
  return <span className={`badge ${badgeTone(status)}`}>{labels[status] || status}</span>;
}

/** The always-clickable Drive folder link. Shown regardless of checkStatus so a
 *  human can open the folder and override a wrong automated verdict. */
export function DriveLink({ href, label = 'Open Drive folder' }) {
  if (!href) return <span className="muted">No Drive link</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="drive-link">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      {label}
    </a>
  );
}

/** Individual file links, so an admin doesn't have to navigate the folder. */
export function FileLinks({ files }) {
  if (!files?.length) return null;
  return (
    <ul className="sub-files">
      {files.map((f, i) => (
        <li key={f.webViewLink || `${f.name}-${i}`}>
          <a href={f.webViewLink} target="_blank" rel="noreferrer" className="file-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M14 2v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            <span className="file-chip-name">{f.name}</span>
          </a>
          <span className="badge">{f.type}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full verification panel for the admin detail view: status badge, the
 * always-clickable folder link, inline error text when the check didn't pass,
 * per-file links when it did, and a manual re-check trigger.
 */
export function SubmissionCheckPanel({ submission, onRecheck, busy = false, audience = 'staff' }) {
  if (!submission) return null;
  const { checkStatus, errorDetail, files, driveLink } = submission;
  const failed = checkStatus === 'NEEDS_FIXES' || checkStatus === 'CHECK_FAILED';

  return (
    <div className="sub-check">
      <div className="sub-check-head">
        <DriveLink href={driveLink} />
        <CheckBadge status={checkStatus} audience={audience} />
        {submission.locked && <span className="badge badge-muted">locked</span>}
        {onRecheck && driveLink && (
          <button type="button" className="btn sm ghost" onClick={onRecheck} disabled={busy}>
            {busy ? 'Re-checking…' : 'Re-check'}
          </button>
        )}
      </div>

      {failed && errorDetail && <p className="sub-check-error">{errorDetail}</p>}
      {checkStatus === 'READY' && <FileLinks files={files} />}
    </div>
  );
}

export { CHECK_LABELS, CHECK_LABELS_STUDENT };

import { useState } from 'react';

// One support conversation, rendered the same way for both sides of it — the
// student who raised it and the admin working the queue see the same thread,
// the same replies and the same status. Only the labels differ, and those come
// from who is looking.

const fmt = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Status is the one thing a support thread has to say at a glance: who it is
// waiting on. The wording is written from the reader's side — "waiting on us"
// means something different to a student than to the admin answering them.
export const STATUS_LABEL = {
  open: { admin: 'Needs a reply', student: 'With support', tone: 'wait' },
  answered: { admin: 'Replied', student: 'Support replied', tone: 'replied' },
  resolved: { admin: 'Resolved', student: 'Resolved', tone: 'done' },
};

export function StatusBadge({ status, viewerRole }) {
  const s = STATUS_LABEL[status] || STATUS_LABEL.open;
  return <span className={`badge badge-${s.tone}`}>{viewerRole === 'admin' ? s.admin : s.student}</span>;
}

export default function SupportThread({ ticket, viewerId, viewerRole, onReply, onStatus }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const owner = ticket.userId || {};
  const ownerName = owner.fullName || owner.email || 'Student';

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onReply(text);
      setBody('');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function setStatus(status) {
    setErr('');
    try { await onStatus(status); } catch (e2) { setErr(e2.message); }
  }

  return (
    <div className="support-thread">
      {(ticket.messages || []).map((m) => {
        // Compared by author, not by role: two admins on the same queue must
        // not both read as "You".
        const mine = String(m.authorId) === String(viewerId);
        const who = mine ? 'You' : m.authorRole === 'admin' ? 'Support' : ownerName;
        return (
          <div key={m._id} className={`support-msg ${mine ? 'mine' : ''}`}>
            <span className="avatar avatar-sm">{(who[0] || '?').toUpperCase()}</span>
            <div className="support-msg-main">
              <div className="support-msg-head">
                <span className="support-msg-who">{who}</span>
                <span className="support-msg-time">{fmt(m.createdAt)}</span>
              </div>
              {/* Nobody writes markdown in a bug report; they write line
                  breaks. pre-wrap keeps those and nothing else. */}
              <div className="support-msg-body">{m.body}</div>
            </div>
          </div>
        );
      })}

      <form className="support-reply" onSubmit={send}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={viewerRole === 'admin' ? 'Reply to this student…' : 'Add anything else that might help…'}
          rows={3}
        />
        <div className="support-actions">
          <button className="btn sm" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
          {ticket.status === 'resolved' ? (
            <button type="button" className="btn sm quiet" onClick={() => setStatus('open')}>Reopen</button>
          ) : (
            <button type="button" className="btn sm quiet" onClick={() => setStatus('resolved')}>Mark resolved</button>
          )}
          {err && <span className="error" role="alert">{err}</span>}
        </div>
      </form>
    </div>
  );
}

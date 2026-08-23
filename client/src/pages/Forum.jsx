import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Batch forum: a Doubts board (post, like, comment). Students ask, admins answer.
export default function Forum() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');

  useEffect(() => {
    api('/batches').then((d) => {
      setBatches(d.batches || []);
      if (d.batches?.[0]) setBatchId(d.batches[0].id);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Forum</div>
          <h1>Doubts</h1>
          <p>Ask a question and get it answered by your peers and the team.</p>
        </div>
      </div>

      {batches.length === 0 ? (
        <p className="muted">You're not in any batch yet — the forum opens once you're enrolled.</p>
      ) : (
        <>
          <div className="learn-select">
            <label>Batch{' '}
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name.replace(/^Demo — /, '')}</option>)}
              </select>
            </label>
          </div>

          {batchId && <Doubts batchId={batchId} me={user} />}
        </>
      )}
    </div>
  );
}

function Doubts({ batchId, me }) {
  const [doubts, setDoubts] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isStudent = me.role === 'student';

  const load = () => api(`/forum/doubts?batchId=${batchId}`).then((d) => setDoubts(d.doubts || [])).catch(() => {});
  // Live: refresh every 5s so admins see new doubts and everyone sees new answers.
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [batchId]);

  async function post(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/forum/doubts', { method: 'POST', body: { batchId, text } });
      setText('');
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {isStudent ? (
        <form className="panel" onSubmit={post}>
          <h3>Ask a doubt</h3>
          <div className="inline-form">
            <input style={{ flex: 1, minWidth: 260 }} placeholder="What are you stuck on?" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your doubt" />
            <button className="btn sm" disabled={busy}>{busy ? 'Posting…' : 'Post doubt'}</button>
          </div>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      ) : (
        <div className="panel"><h3>Student doubts</h3><p className="muted">Answer your students' questions below. New doubts appear here live.</p></div>
      )}

      <div className="list">
        {doubts.length === 0 && <p className="muted">{isStudent ? 'No doubts yet. Be the first to ask.' : 'No doubts yet — students will post them here.'}</p>}
        {doubts.map((d) => <DoubtCard key={d.id} doubt={d} me={me} onChange={load} />)}
      </div>
    </div>
  );
}

function DoubtCard({ doubt, me, onChange }) {
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function like() { try { await api(`/forum/doubts/${doubt.id}/like`, { method: 'POST' }); onChange(); } catch { /* transient — next poll reconciles */ } }
  async function addComment(e) {
    e.preventDefault();
    if (!comment.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/forum/doubts/${doubt.id}/comments`, { method: 'POST', body: { text: comment } });
      setComment('');
      onChange();
    } catch { /* keep the draft so the reply isn't lost on a failed send */ }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="doubt-head">
        <div>
          <strong>{doubt.author?.name}</strong>
          {doubt.author?.role === 'admin' && <span className="badge badge-accent" style={{ marginLeft: 6 }}>admin</span>}
          <div className="muted" style={{ fontSize: 12 }}>{new Date(doubt.at).toLocaleString()}</div>
        </div>
      </div>
      <p style={{ margin: '8px 0 12px' }}>{doubt.text}</p>
      <div className="row">
        <button className={`like-btn ${doubt.likedByMe ? 'liked' : ''}`} onClick={like}>▲ {doubt.likeCount}</button>
        <button className="btn sm ghost" onClick={() => setOpen((o) => !o)}>{doubt.comments.length} comment{doubt.comments.length === 1 ? '' : 's'}</button>
      </div>

      {open && (
        <div className="comments">
          {doubt.comments.map((c) => (
            <div key={c.id} className="comment">
              <strong>{c.author?.name}</strong>{c.author?.role === 'admin' && <span className="badge badge-accent" style={{ marginLeft: 6 }}>admin</span>}
              <span> — {c.text}</span>
            </div>
          ))}
          <form className="inline-form" onSubmit={addComment}>
            <input style={{ flex: 1, minWidth: 220 }} placeholder={me.role === 'admin' ? 'Write an answer…' : 'Add a comment…'} value={comment} onChange={(e) => setComment(e.target.value)} aria-label={me.role === 'admin' ? 'Your answer' : 'Your comment'} />
            <button className="btn sm" disabled={busy}>{busy ? 'Sending…' : (me.role === 'admin' ? 'Answer' : 'Reply')}</button>
          </form>
        </div>
      )}
    </div>
  );
}

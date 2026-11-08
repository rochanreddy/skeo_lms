import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';

// Admin: push an update into every student's Updates card on their home
// screen, with a notification (bell + phone push) alongside it. By default it
// is an update from the skeo team to everyone; it can be narrowed to one cohort.
// The panel lists what has been pushed, newest first, with a way to take
// each one back down.
const EVERYONE = 'everyone';

export default function PushUpdates() {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState(null);
  const [batches, setBatches] = useState([]);

  const load = () => api('/announcements').then((d) => setUpdates(d.announcements || [])).catch(() => setUpdates([]));
  useEffect(() => {
    load();
    api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
  }, []);

  async function remove(id) {
    if (!window.confirm('Take this update down? Students will stop seeing it.')) return;
    await api(`/announcements/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  return (
    <div className="panel pu-panel">
      <div className="pu-head">
        <div>
          <div className="eyebrow">Student home</div>
          <h2>Updates</h2>
          <p className="muted pu-lead">What students see in the Updates card. Mostly news from the skeo team.</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>Push update</button>
      </div>

      {updates === null ? (
        <p className="muted">Loading…</p>
      ) : updates.length === 0 ? (
        <p className="muted">Nothing pushed yet. Students see an empty Updates card until you do.</p>
      ) : (
        <div className="pu-list">
          {updates.slice(0, 8).map((u) => (
            <div className="pu-row" key={u._id}>
              <div className="pu-text">
                <strong>{u.title}</strong>
                {u.body && <span className="pu-body">{u.body}</span>}
                <span className="pu-meta">
                  {u.batchId ? u.batchId.name || 'One batch' : 'Everyone'} · {new Date(u.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  {u.link && <> · <a href={u.link} target="_blank" rel="noreferrer">{u.link.replace(/^https?:\/\//, '')}</a></>}
                </span>
              </div>
              <button className="btn sm ghost" onClick={() => remove(u._id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <Composer open={open} onOpenChange={setOpen} batches={batches} onPosted={load} />
    </div>
  );
}

function Composer({ open, onOpenChange, batches, onPosted }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState(EVERYONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  function reset() {
    setTitle(''); setBody(''); setLink(''); setAudience(EVERYONE); setError(''); setSent(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return setError('Give it a title.');
    setBusy(true); setError('');
    try {
      const d = await api('/announcements', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim(), link: link.trim(), batchId: audience === EVERYONE ? undefined : audience },
      });
      setSent(d.notified ?? 0);
      onPosted();
    } catch (err) {
      setError(err.message || 'Could not push the update.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="pu-dialog">
        <DialogTitle>Push an update</DialogTitle>

        {sent !== null ? (
          <div className="pu-done">
            <p>Pushed to {sent} student{sent === 1 ? '' : 's'}. It's on their home screen now.</p>
            <div className="pu-actions">
              <button className="btn ghost" onClick={reset}>Push another</button>
              <button className="btn" onClick={() => onOpenChange(false)}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="pu-title">Title</label>
              <input id="pu-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New masterclass: Claude for founders" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="pu-body">Details <span className="muted">(optional)</span></label>
              <textarea id="pu-body" className="pu-textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="One or two lines students will read on their home screen." />
            </div>
            <div className="field">
              <label htmlFor="pu-link">Link <span className="muted">(optional)</span></label>
              <input id="pu-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="menler.com/events" />
            </div>
            <div className="field">
              <label>Who sees it</label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="pu-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={EVERYONE}>Every student</SelectItem>
                  {batches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="pu-error">{error}</p>}
            <div className="pu-actions">
              <button type="button" className="btn ghost" onClick={() => onOpenChange(false)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Pushing…' : 'Push & notify'}</button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

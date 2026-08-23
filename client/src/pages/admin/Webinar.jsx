import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';

// Webinars — admins schedule; the list shows join link, slides, recording.
export default function Webinar() {
  const { user } = useOutletContext();
  const canAdd = user.role === 'admin';
  const [webinars, setWebinars] = useState([]);
  const [form, setForm] = useState({ title: '', startsAt: '', joinUrl: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api('/webinars').then((d) => setWebinars(d.webinars || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/webinars', { method: 'POST', body: { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null } });
      setForm({ title: '', startsAt: '', joinUrl: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  const now = Date.now();
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Webinars</div>
          <h1>Live masterclasses</h1>
          <p>Upcoming sessions, slides and recordings.</p>
        </div>
      </div>

      {canAdd && (
        <form className="panel" onSubmit={add}>
          <h3>Schedule a webinar</h3>
          <div className="inline-form">
            <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <DateTimePicker value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))} placeholder="Starts at" />
            <input placeholder="Join link" value={form.joinUrl} onChange={(e) => setForm((f) => ({ ...f, joinUrl: e.target.value }))} />
            <button className="btn sm" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </div>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}

      <div className="list">
        {webinars.map((w) => {
          const past = w.startsAt && new Date(w.startsAt).getTime() < now;
          return (
            <div key={w._id} className="panel list-row">
              <div>
                <strong>{w.title}</strong> <span className={`badge ${past ? 'badge-muted' : 'badge-student'}`}>{past ? 'past' : 'upcoming'}</span>
                <div className="muted">{w.startsAt ? new Date(w.startsAt).toLocaleString() : 'Date TBA'}</div>
              </div>
              <div className="row">
                {w.joinUrl && !past && <a className="zoom-link" href={w.joinUrl} target="_blank" rel="noreferrer">Join →</a>}
                {w.pptUrl && <a className="zoom-link" href={w.pptUrl} target="_blank" rel="noreferrer">Slides</a>}
                {w.recordingUrl && <a className="zoom-link" href={w.recordingUrl} target="_blank" rel="noreferrer">Recording</a>}
              </div>
            </div>
          );
        })}
        {webinars.length === 0 && <p className="muted">No webinars scheduled yet.</p>}
      </div>
    </div>
  );
}

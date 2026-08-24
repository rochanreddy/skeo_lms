import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

const TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract'];

// Job/internship openings. Admins post; everyone browses and applies via link.
export default function JobBoard() {
  const { user } = useOutletContext();
  const canPost = user.role === 'admin';
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({ title: '', company: '', location: '', type: 'Full-time', applyUrl: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api('/jobs').then((d) => setJobs(d.jobs || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function post(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/jobs', { method: 'POST', body: form });
      setForm({ title: '', company: '', location: '', type: 'Full-time', applyUrl: '', description: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm('Remove this posting?')) return;
    try { await api(`/jobs/${id}`, { method: 'DELETE' }); load(); } catch { /* next load reconciles */ }
  }

  const shown = filter === 'All' ? jobs : jobs.filter((j) => j.type === filter);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Job Board</div>
          <h1>Openings</h1>
          <p>Jobs and internships shared by the team — apply straight from here.</p>
        </div>
      </div>

      {canPost && (
        <form className="panel" onSubmit={post}>
          <h3>Post an opening</h3>
          <div className="inline-form">
            <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            <input placeholder="Location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="Apply link" value={form.applyUrl} onChange={(e) => setForm((f) => ({ ...f, applyUrl: e.target.value }))} />
            <button className="btn sm" disabled={busy}>{busy ? 'Posting…' : 'Post'}</button>
          </div>
          <textarea style={{ marginTop: 10, width: '100%' }} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}

      <div className="tabs" style={{ marginTop: 18 }}>
        {['All', ...TYPES].map((t) => (
          <button key={t} className={`tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {shown.length === 0 && <p className="muted">No openings yet.</p>}
        {shown.map((j) => (
          <div key={j._id} className="panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-accent">{j.type}</span>
                <h3 style={{ margin: '8px 0 2px' }}>{j.title}</h3>
                <div className="muted">{j.company}{j.location ? ` — ${j.location}` : ''}</div>
              </div>
              {canPost && <button className="btn sm ghost-danger" onClick={() => remove(j._id)}>Remove</button>}
            </div>
            {j.description && <p style={{ margin: '10px 0' }}>{j.description}</p>}
            {j.applyUrl && <a className="btn sm" href={j.applyUrl} target="_blank" rel="noreferrer">Apply →</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

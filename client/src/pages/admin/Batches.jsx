import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import BatchWorkspace from '../../components/BatchWorkspace.jsx';

// Admin: create batches under a program, then open one to enrol students,
// enroll students, and schedule sessions (via BatchWorkspace, admin mode).
export default function AdminBatches() {
  const [batches, setBatches] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [open, setOpen] = useState(null); // batch id being managed
  const [form, setForm] = useState({ programId: '', name: '', status: 'upcoming' });
  const [err, setErr] = useState('');

  const load = () => api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
  useEffect(() => {
    load();
    api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/batches', { method: 'POST', body: form });
      setForm({ programId: '', name: '', status: 'upcoming' });
      load();
    } catch (e2) { setErr(e2.message); }
  }

  if (open) return (
    <div>
      <button className="btn ghost sm" onClick={() => { setOpen(null); load(); }}>← All batches</button>
      <div style={{ height: 12 }} />
      <BatchWorkspace batchId={open} />
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <h1>Batches</h1>
          <p>Create cohorts, then manage each one — roster, sessions, assignments, grades.</p>
        </div>
      </div>

      <form className="panel" onSubmit={create}>
        <h3>Create a batch</h3>
        <div className="inline-form">
          <select value={form.programId} onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))} required>
            <option value="">Program…</option>
            {programs.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </select>
          <input placeholder="Batch name (e.g. Kickstarter — July 2026)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option><option value="past">Past</option>
          </select>
          <button className="btn sm">Create</button>
        </div>
        {err && <span className="error">{err}</span>}
      </form>

      <div className="list">
        {batches.map((b) => (
          <div className="panel list-row row-click" key={b.id} onClick={() => setOpen(b.id)}>
            <div>
              <strong>{b.name}</strong>
              <div className="muted">{b.program} · {b.status} · {b.studentCount} students</div>
            </div>
            <button className="btn sm" onClick={() => setOpen(b.id)}>Manage</button>
          </div>
        ))}
        {batches.length === 0 && (
          <div className="empty"><div className="empty-icon">🎓</div><strong>No batches yet</strong>Create your first cohort with the form above.</div>
        )}
      </div>
    </div>
  );
}

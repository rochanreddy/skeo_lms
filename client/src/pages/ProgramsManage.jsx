import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import CurriculumEditor from '../components/CurriculumEditor.jsx';

// Admin: create + list programs, and manage each program's curriculum (upload
// docs → auto-structured lessons students see in Learning).
export default function ProgramsManage() {
  const { user } = useOutletContext();
  const isAdmin = user.role === 'admin';
  const [programs, setPrograms] = useState([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // programId being edited

  const load = () => api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/programs', { method: 'POST', body: { title } });
      setTitle('');
      load();
    } catch (e2) { setErr(e2.message); }
  }

  if (editing) return <CurriculumEditor programId={editing} onClose={() => { setEditing(null); load(); }} />;

  const lessons = (p) => (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{isAdmin ? 'Admin board' : 'Programs'}</div>
          <h1>Programs</h1>
          <p>Every program and its curriculum — the lessons students see in Learning.</p>
        </div>
      </div>

      {isAdmin && (
        <form className="panel row" onSubmit={create}>
          <input placeholder="New program title (e.g. Kickstarter)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <button className="btn">Create</button>
          {err && <span className="error">{err}</span>}
        </form>
      )}

      <div className="list">
        {programs.map((p) => (
          <div className="panel list-row" key={p._id}>
            <div>
              <strong>{p.title}</strong>
              <div className="muted">{p.modules?.length || 0} modules · {lessons(p)} lessons · <span className={p.published ? 'pub-on' : 'pub-off'}>{p.published ? '● published' : '○ draft'}</span></div>
            </div>
            {isAdmin && <button className="btn sm" onClick={() => setEditing(p._id)}>Manage curriculum</button>}
          </div>
        ))}
        {programs.length === 0 && <p className="muted">No programs yet.{isAdmin ? ' Create one above.' : ''}</p>}
      </div>
    </div>
  );
}

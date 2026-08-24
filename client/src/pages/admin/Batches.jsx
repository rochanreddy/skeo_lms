import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import BatchWorkspace from '../../components/BatchWorkspace.jsx';

// Admin: the course workspace — roster, announcements, assignments/projects,
// quizzes and the gradebook.
//
// There are no cohorts in this product: one course, one roster. A single Batch
// record still backs it server-side (assignments, quizzes and announcements all
// hang off a batchId), but that's plumbing — it is never surfaced as a choice.
// This page opens that one record directly, and creates it if it's missing.
export default function AdminCourse() {
  const [batchId, setBatchId] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | empty | error
  const [err, setErr] = useState('');

  const load = () => api('/batches')
    .then((d) => {
      const first = (d.batches || [])[0];
      if (first) { setBatchId(first.id); setState('ready'); }
      else setState('empty');
    })
    .catch((e) => { setErr(e.message); setState('error'); });
  useEffect(() => { load(); }, []);

  // Bootstrap: no course record yet, so make the one this product needs.
  async function create() {
    setErr('');
    try {
      const { programs } = await api('/programs');
      const program = (programs || [])[0];
      if (!program) return setErr('Publish a programme first — the course attaches to it.');
      await api('/batches', { method: 'POST', body: { programId: program._id, name: program.title, status: 'ongoing' } });
      load();
    } catch (e) { setErr(e.message); }
  }

  if (state === 'loading') {
    return <div className="skeleton"><div className="skeleton-row" /><div className="skeleton-row tall" /></div>;
  }

  if (state === 'ready') return <BatchWorkspace batchId={batchId} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <h1>Course</h1>
          <p>Your roster, projects, quizzes and grades.</p>
        </div>
      </div>
      <div className="empty">
        <div className="empty-icon">🎓</div>
        <strong>{state === 'error' ? 'Could not load the course' : 'No course set up yet'}</strong>
        {state === 'error' ? err : 'Create it once and every student joins the same one.'}
        {state !== 'error' && (
          <div style={{ marginTop: 14 }}><button className="btn sm" onClick={create}>Create the course</button></div>
        )}
      </div>
      {err && state !== 'error' && <p className="error" style={{ marginTop: 10 }}>{err}</p>}
    </div>
  );
}

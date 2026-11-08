import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, fetchFileBytes } from '../api.js';
import FileViewer from '../components/FileViewer.jsx';
import LineIcon from '../components/LineIcon.jsx';
import { PRICING_URL } from '../components/GetSkeo.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';

const CATEGORIES = ['PPT', 'eBook', 'Note', 'Library'];
// The paid sets a playbook can belong to, as the website sells them.
const SET_LABEL = { claude: 'Claude Playbooks', ai: 'AI Library' };

// What kind of resource it is, as a small icon tile, so a row of cards is
// told apart at a glance instead of by a capsule repeated on every one.
const KIND_ICON = { PPT: 'slides', eBook: 'book', Note: 'folder', Library: 'briefcase' };

// The top of every card: icon tile, then title and a short description.
function CardBody({ item }) {
  return (
    <span className="lib-body">
      <span className="lib-icon" aria-hidden="true"><LineIcon name={KIND_ICON[item.category] || 'book'} size={18} /></span>
      <span className="lib-text">
        <strong>{item.title}</strong>
        {item.description && <span className="lib-desc">{item.description}</span>}
      </span>
    </span>
  );
}

// Downloadable resource library. Everyone browses; admins add by link.
export default function Library() {
  const { user } = useOutletContext();
  const canAdd = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({ title: '', category: 'Note', url: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Until the first load lands, an empty list means "not known yet", not
  // "nothing here", saying the latter reads as broken rather than slow.
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(null); // the paid playbook open in the reader

  const load = () => api('/library').then((d) => setItems(d.items || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/library', { method: 'POST', body: form });
      setForm({ title: '', category: 'Note', url: '', description: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  const shown = filter === 'All' ? items : items.filter((i) => i.category === filter);

  return (
    <div className="lib-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Library</div>
          <h1>Resources</h1>
          <p>Slides, eBooks and notes: everything to go deeper.</p>
        </div>
      </div>

      {canAdd && (
        <form className="panel" onSubmit={add}>
          <h3>Add a resource</h3>
          <div className="inline-form">
            <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <input placeholder="Link (Drive, PDF…)" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            <button className="btn sm" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </div>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}

      <div className="tabs" style={{ marginTop: 18 }}>
        {['All', ...CATEGORIES].map((c) => (
          <button key={c} className={`tab ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>

      <div className="lib-grid">
        {loading && [0, 1, 2, 3].map((n) => <div key={n} className="lib-card skeleton-row" style={{ height: 132 }} />)}
        {!loading && shown.map((i) => (i.playbookSet ? (
          // A paid playbook: read in the in-app reader by a buyer, otherwise a
          // pointer to the plans. Never a link to the file itself.
          i.locked ? (
            <a key={i._id} className="lib-card is-locked" href={PRICING_URL}>
              <CardBody item={i} />
              <span className="lib-foot">
                <span className="lib-lock">
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span>{SET_LABEL[i.playbookSet]} or Everything AI</span>
                </span>
                <span className="lib-open">See plans →</span>
              </span>
            </a>
          ) : (
            <button key={i._id} type="button" className="lib-card" onClick={() => setReading(i)}>
              <CardBody item={i} />
              <span className="lib-foot"><span className="lib-kind">{i.category}</span><span className="lib-open">Read →</span></span>
            </button>
          )
        ) : (
          <a key={i._id} className="lib-card" href={i.url || '#'} target={i.url ? '_blank' : undefined} rel="noreferrer">
            <CardBody item={i} />
            <span className="lib-foot"><span className="lib-kind">{i.category}</span><span className="lib-open">{i.url ? 'Open →' : 'No link'}</span></span>
          </a>
        )))}
        {!loading && shown.length === 0 && <p className="muted">No resources yet.</p>}
      </div>

      {reading && (
        <FileViewer
          label={SET_LABEL[reading.playbookSet]}
          subtitle={reading.title}
          url={reading.url}
          loadBytes={() => fetchFileBytes(reading.url)}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}

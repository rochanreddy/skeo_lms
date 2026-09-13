import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import DateTimePicker from '../components/DateTimePicker.jsx';

// Masterclasses. An admin pushes the link to a masterclass's landing page;
// every student is notified and finds it here.
//
// The card is deliberately a signpost, not a copy of the landing page. The
// speaker, the agenda and the registration form all live on the other side of
// that link, and duplicating them here would only produce a second version to
// keep in sync — the stale one being ours.

const BLANK = { title: '', landingUrl: '', startsAt: '', note: '' };

const fmtDay = (d) => new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// "in 3 days" / "in 2 hours" — the distance is what tells you whether to act
// now, and an absolute date on its own never does.
function countdown(startsAt) {
  const ms = new Date(startsAt) - Date.now();
  if (ms <= 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

const startedAt = (w) => (w.startsAt ? new Date(w.startsAt).getTime() : null);

// The domain, under the title. It's the one honest hint about where the link
// goes, and it costs the admin nothing to provide.
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// One masterclass. Hoisted out of the page because the page re-renders on a
// timer: defined inline, every card would be torn down and rebuilt each tick.
function Card({ w, past, canPost, onEdit, onRemove }) {
  const when = startedAt(w);
  return (
    <div className={`panel webinar ${past ? 'past' : ''}`}>
      {/* The rail only exists when there's a date to put in it — an undated
          link is an open invitation, and an empty column would just look like
          something failed to load. */}
      {when && (
        <div className="webinar-when">
          <span className="webinar-when-day">{fmtDay(w.startsAt)}</span>
          <span className="webinar-when-time">{fmtTime(w.startsAt)}</span>
        </div>
      )}

      <div className="webinar-main">
        <div className="webinar-top">
          {!past && when && <span className="badge badge-accent">{countdown(w.startsAt) || 'Starting now'}</span>}
          {past && <span className="badge badge-muted">Finished</span>}
          <h3 className="webinar-title">{w.title}</h3>
          {hostOf(w.landingUrl) && <div className="webinar-host">{hostOf(w.landingUrl)}</div>}
        </div>

        {w.note && <p className="webinar-desc">{w.note}</p>}

        <div className="webinar-actions">
          <a className={`btn sm ${past ? 'ghost' : ''}`} href={w.landingUrl} target="_blank" rel="noreferrer">
            {past ? 'Open page →' : 'View & register →'}
          </a>
          {canPost && (
            <>
              <button className="btn sm quiet" onClick={() => onEdit(w)}>Edit</button>
              <button className="btn sm ghost-danger" onClick={() => onRemove(w._id)}>Remove</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Webinars() {
  const { user } = useOutletContext();
  const canPost = user.role === 'admin';

  const [webinars, setWebinars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null); // id being edited, or null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Ticked so a session that starts while the page is open moves itself out of
  // "Coming up" — and so "in 40 min" isn't still saying it an hour later.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = () => api('/webinars')
    .then((d) => setWebinars(d.webinars || []))
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // Two lists, sorted in opposite directions on purpose: what's next comes
  // first in a schedule, what's newest comes first in an archive. An undated
  // masterclass never becomes past — it's an open invitation, so it sits at
  // the end of "Coming up" until an admin takes it down.
  const { upcoming, past } = useMemo(() => {
    const groups = { upcoming: [], past: [] };
    for (const w of webinars) {
      const at = startedAt(w);
      groups[at !== null && at < now ? 'past' : 'upcoming'].push(w);
    }
    groups.upcoming.sort((a, b) => {
      const x = startedAt(a);
      const y = startedAt(b);
      if (x === null && y === null) return new Date(b.createdAt) - new Date(a.createdAt);
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y;
    });
    groups.past.sort((a, b) => startedAt(b) - startedAt(a));
    return groups;
  }, [webinars, now]);

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.landingUrl.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      if (editing) await api(`/webinars/${editing}`, { method: 'PATCH', body: form });
      else await api('/webinars', { method: 'POST', body: form });
      setForm(BLANK);
      setEditing(null);
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  function edit(w) {
    // The picker speaks 'YYYY-MM-DDTHH:mm' in local time, which is what the
    // admin typed in the first place — so convert back the same way.
    const pad = (n) => String(n).padStart(2, '0');
    let startsAt = '';
    if (w.startsAt) {
      const d = new Date(w.startsAt);
      startsAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    setEditing(w._id);
    setForm({ title: w.title || '', landingUrl: w.landingUrl || '', startsAt, note: w.note || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(id) {
    if (!window.confirm('Remove this masterclass?')) return;
    try { await api(`/webinars/${id}`, { method: 'DELETE' }); load(); } catch { /* next load reconciles */ }
  }

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="webinar-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Masterclasses</div>
          <h1>Live sessions</h1>
          <p>
            {canPost
              ? 'Paste the masterclass link. Every student is notified, and registers on the page itself.'
              : 'Masterclasses run by the team and guest speakers. Open one for the details and to register.'}
          </p>
        </div>
      </div>

      {canPost && (
        <form className="panel" onSubmit={save}>
          <h3>{editing ? 'Edit masterclass' : 'Push a masterclass'}</h3>
          {/* The link leads the form because it's the whole point of it: the
              other fields only describe the card that carries it. */}
          <label>
            Masterclass link
            <input
              placeholder="lu.ma/… — the landing page students register on"
              value={form.landingUrl}
              onChange={(e) => set('landingUrl')(e.target.value)}
            />
          </label>
          <div className="field-grid">
            <label>
              Title
              <input
                placeholder="What students see on the card"
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
              />
            </label>
            <label>
              When <span className="muted">(optional)</span>
              <DateTimePicker value={form.startsAt} onChange={set('startsAt')} placeholder="Details on the page" />
            </label>
          </div>
          <label>
            Note <span className="muted">(optional — anything the landing page doesn't say)</span>
            <input placeholder="e.g. Open to all cohorts" value={form.note} onChange={(e) => set('note')(e.target.value)} />
          </label>

          <div className="webinar-form-foot">
            <button className="btn" disabled={busy || !form.title.trim() || !form.landingUrl.trim()}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Push & notify students'}
            </button>
            {editing && (
              <button type="button" className="btn quiet" onClick={() => { setEditing(null); setForm(BLANK); setErr(''); }}>
                Cancel
              </button>
            )}
            {err && <span className="error" role="alert">{err}</span>}
          </div>
        </form>
      )}

      {loading && [0, 1].map((n) => <div key={n} className="panel skeleton-row" style={{ height: 110 }} />)}

      {!loading && webinars.length === 0 && (
        <p className="muted">
          {canPost ? 'No masterclasses pushed yet.' : 'No masterclasses right now — you\'ll be notified when one is announced.'}
        </p>
      )}

      {upcoming.length > 0 && (
        <section>
          <h3 className="ruled-head">Coming up</h3>
          <div className="list">
            {upcoming.map((w) => <Card key={w._id} w={w} past={false} canPost={canPost} onEdit={edit} onRemove={remove} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h3 className="ruled-head">Past sessions</h3>
          <div className="list">
            {past.map((w) => <Card key={w._id} w={w} past canPost={canPost} onEdit={edit} onRemove={remove} />)}
          </div>
        </section>
      )}
    </div>
  );
}

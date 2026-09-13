import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import SupportThread, { StatusBadge } from '../components/SupportThread.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';

// Where a student goes when the LMS itself is the problem — a video that won't
// play, a lesson that's locked, a grade that looks wrong. It isn't in the dock:
// you reach it from the account menu or ⌘K, on the day you need it.
//
// Deliberately not an email address. A ticket keeps the thread, the reply and
// the status in the one place the student is already signed in to, and puts it
// in front of every admin at once instead of one person's inbox.

const CATEGORIES = ['Technical', 'Course content', 'Account & access', 'Payment', 'Other'];
const BLANK = { subject: '', category: 'Technical', message: '' };

export default function Support() {
  const { user } = useOutletContext();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  // Which thread is expanded. One at a time: the page is a history, not an inbox.
  const [openId, setOpenId] = useState(null);

  const load = () => api('/support')
    .then((d) => setTickets(d.tickets || []))
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function raise(e) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const { ticket } = await api('/support', { method: 'POST', body: form });
      setForm(BLANK);
      setSent(true);
      setOpenId(ticket._id); // land on the thread you just started
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  // Both of these answer with the updated ticket, so the thread can be swapped
  // in place rather than re-fetching the whole list and losing the scroll.
  const replace = (t) => setTickets((all) => all.map((x) => (x._id === t._id ? t : x)));

  const reply = async (id, body) => {
    const { ticket } = await api(`/support/${id}/messages`, { method: 'POST', body: { body } });
    replace(ticket);
  };
  const setStatus = async (id, status) => {
    const { ticket } = await api(`/support/${id}`, { method: 'PATCH', body: { status } });
    replace(ticket);
  };

  return (
    <div className="support-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Support</div>
          <h1>Something not working?</h1>
          <p>Tell us what happened and an admin will get back to you here. You'll get a notification when they reply.</p>
        </div>
      </div>

      <form className="panel" onSubmit={raise}>
        <h3>Raise a request</h3>
        <div className="field-grid">
          <label>
            Subject
            <input
              placeholder="A short summary — e.g. “Module 3 video won't load”"
              value={form.subject}
              maxLength={140}
              onChange={(e) => { setSent(false); setForm((f) => ({ ...f, subject: e.target.value })); }}
            />
          </label>
          <label>
            What's it about?
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>
        <label>
          Details
          <textarea
            rows={5}
            placeholder="What were you doing, what did you expect, and what happened instead? Anything you can add — the lesson name, the time it happened — gets this fixed faster."
            value={form.message}
            maxLength={4000}
            onChange={(e) => { setSent(false); setForm((f) => ({ ...f, message: e.target.value })); }}
          />
        </label>
        <div className="support-actions" style={{ marginTop: 14 }}>
          <button className="btn" disabled={busy || !form.subject.trim() || !form.message.trim()}>
            {busy ? 'Sending…' : 'Send to support'}
          </button>
          {sent && <span className="support-sent">Sent — we'll reply in this thread.</span>}
          {err && <span className="error" role="alert">{err}</span>}
        </div>
      </form>

      <section>
        <h3 className="ruled-head">Your requests</h3>
        {loading && [0, 1].map((n) => <div key={n} className="panel skeleton-row" style={{ height: 92, marginBottom: 12 }} />)}
        {!loading && tickets.length === 0 && <p className="muted">Nothing raised yet — anything you send lands here.</p>}

        <div className="list">
          {tickets.map((t) => {
            const expanded = openId === t._id;
            return (
              <div key={t._id} className={`panel support-ticket ${expanded ? 'open' : ''}`}>
                <button className="support-ticket-head" onClick={() => setOpenId(expanded ? null : t._id)} aria-expanded={expanded}>
                  <div>
                    <div className="support-ticket-title">{t.subject}</div>
                    <div className="support-ticket-meta">
                      {t.category} · {t.messages?.length || 0} message{(t.messages?.length || 0) === 1 ? '' : 's'} ·
                      {' '}updated {new Date(t.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div className="support-ticket-side">
                    <StatusBadge status={t.status} viewerRole="student" />
                    <span className={`support-chev ${expanded ? 'up' : ''}`} aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </div>
                </button>

                {expanded && (
                  <SupportThread
                    ticket={t}
                    viewerId={user.id}
                    viewerRole="student"
                    onReply={(body) => reply(t._id, body)}
                    onStatus={(status) => setStatus(t._id, status)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

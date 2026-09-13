import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import SupportThread, { StatusBadge } from '../../components/SupportThread.jsx';

// Admin: the queue of everything students have raised about the LMS.
//
// It opens on "Needs a reply" rather than on everything, because that is the
// only view with work in it — the rest is archive. Threads expand in place;
// answering never leaves the queue.

const FILTERS = [
  { key: 'open', label: 'Needs a reply' },
  { key: 'answered', label: 'Replied' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const fmt = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AdminSupport() {
  const { user } = useOutletContext();
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ open: 0, answered: 0, resolved: 0 });
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  // The whole queue is fetched once and filtered here: it's capped at 100 on
  // the server, and counts have to span every status anyway, so a round trip
  // per tab would buy nothing.
  const load = () => api('/support')
    .then((d) => { setTickets(d.tickets || []); setCounts(d.counts || {}); })
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // From the counts, not from `tickets` — the list stops at 100, the totals don't.
  const total = (counts.open || 0) + (counts.answered || 0) + (counts.resolved || 0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickets
      .filter((t) => filter === 'all' || t.status === filter)
      .filter((t) => {
        if (!needle) return true;
        const who = `${t.userId?.fullName || ''} ${t.userId?.email || ''}`;
        return `${t.subject} ${who} ${t.category}`.toLowerCase().includes(needle);
      });
  }, [tickets, filter, q]);

  // Replying changes a ticket's status, which can move the ticket out from
  // under the current tab — so the tab counts move with it. They're adjusted by
  // the delta rather than recounted from `tickets`: the list is capped at 100
  // and the counts aren't, so a recount would quietly understate a long queue.
  const replace = (updated) => {
    const prev = tickets.find((x) => x._id === updated._id);
    if (prev && prev.status !== updated.status) {
      setCounts((c) => ({
        ...c,
        [prev.status]: Math.max(0, (c[prev.status] || 0) - 1),
        [updated.status]: (c[updated.status] || 0) + 1,
      }));
    }
    setTickets((all) => all.map((x) => (x._id === updated._id ? updated : x)));
  };

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
          <div className="eyebrow">Admin board</div>
          <h1>Support</h1>
          <p>Questions and issues students have raised about the LMS. Replying notifies them in the app.</p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><div className="tile-value">{counts.open || 0}</div><div className="tile-label">Waiting on us</div></div>
        <div className="tile"><div className="tile-value">{counts.answered || 0}</div><div className="tile-label">Replied</div></div>
        <div className="tile"><div className="tile-value">{counts.resolved || 0}</div><div className="tile-label">Resolved</div></div>
        <div className="tile"><div className="tile-value">{total}</div><div className="tile-label">Total</div></div>
      </div>

      <div className="support-toolbar">
        <div className="tabs" style={{ marginBottom: 0, flex: 1 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key !== 'all' && counts[f.key] ? <span className="tab-count">{counts[f.key]}</span> : null}
            </button>
          ))}
        </div>
        <input
          className="support-search"
          placeholder="Search subject, student or category…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && [0, 1, 2].map((n) => <div key={n} className="panel skeleton-row" style={{ height: 92, marginBottom: 12 }} />)}
      {!loading && shown.length === 0 && (
        <p className="muted">
          {filter === 'open' ? 'Nothing waiting on us — the queue is clear.' : 'Nothing here.'}
        </p>
      )}

      <div className="list">
        {shown.map((t) => {
          const expanded = openId === t._id;
          const who = t.userId?.fullName || t.userId?.email || 'Unknown';
          return (
            <div key={t._id} className={`panel support-ticket ${expanded ? 'open' : ''}`}>
              <button className="support-ticket-head" onClick={() => setOpenId(expanded ? null : t._id)} aria-expanded={expanded}>
                <div>
                  <div className="support-ticket-title">{t.subject}</div>
                  <div className="support-ticket-meta">
                    {who} · {t.category} · {t.messages?.length || 0} message{(t.messages?.length || 0) === 1 ? '' : 's'} · {fmt(t.updatedAt)}
                  </div>
                </div>
                <div className="support-ticket-side">
                  <StatusBadge status={t.status} viewerRole="admin" />
                  <span className={`support-chev ${expanded ? 'up' : ''}`} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </span>
                </div>
              </button>

              {expanded && (
                <>
                  {/* Straight through to the record of whoever is asking —
                      half of answering these is knowing where they're up to. */}
                  {t.userId?._id && (
                    <div className="support-who-link">
                      <Link to={`/app/students/${t.userId._id}`}>View {who}'s record →</Link>
                    </div>
                  )}
                  <SupportThread
                    ticket={t}
                    viewerId={user.id}
                    viewerRole="admin"
                    onReply={(body) => reply(t._id, body)}
                    onStatus={(status) => setStatus(t._id, status)}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

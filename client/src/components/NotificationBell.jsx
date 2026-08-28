import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';

// Live notification bell — polls, shows an unread badge, and a dropdown.
//
// The panel is a Radix Popover: it used to close on an outside mousedown and
// nothing else, so Escape did nothing and focus never moved into the list.
// Radix supplies Escape, focus return and aria-expanded; the polling, the
// unread count and the mark-read-on-open call are unchanged.
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const load = () => api('/notifications').then((d) => { setItems(d.items || []); setUnread(d.unread || 0); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  async function onOpenChange(next) {
    setOpen(next);
    if (next && unread > 0) { await api('/notifications/read', { method: 'POST' }).catch(() => {}); setUnread(0); }
  }
  function go(n) { setOpen(false); if (n.link) nav(n.link); }

  return (
    <div className="notif">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button className="notif-btn" title="Notifications" aria-label="Notifications">
            <svg className="notif-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" />
              <path d="M13.7 20a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" sideOffset={8} className="notif-menu p-0">
          <div className="notif-head">Notifications</div>
          {items.length === 0 && <div className="notif-empty">You're all caught up 🎉</div>}
          {items.map((n) => (
            <button key={n._id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => go(n)}>
              <div className="notif-text">{n.text}</div>
              <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

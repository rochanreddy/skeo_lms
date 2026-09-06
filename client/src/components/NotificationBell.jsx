import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import NotificationBellButton from './NotificationBellButton.jsx';

// Live notification bell — polls, shows an unread badge, and a dropdown.
//
// The panel is a Radix Popover, which brings floating-ui and the popper stack
// with it. That's a lot of code for something nobody can see until they click,
// so the button ships eagerly and the panel is fetched on first interaction,
// mounted already-open. Hover and focus both prefetch it, and both precede a
// click, so the chunk is normally warm by the time it's needed.
//
// The polling, the unread count and the mark-read-on-open call stay here — the
// badge has to be right whether or not the panel has ever been opened.
const NotificationPanel = lazy(() => import('./NotificationPanel.jsx'));
const warm = () => { import('./NotificationPanel.jsx'); };

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const nav = useNavigate();

  const load = () => api('/notifications').then((d) => { setItems(d.items || []); setUnread(d.unread || 0); }).catch(() => {});

  // Poll only while the tab is actually being looked at. A backgrounded tab
  // used to keep issuing three requests a minute for a badge nobody could see;
  // coming back to the tab refreshes immediately, so nothing is lost.
  useEffect(() => {
    let t = null;
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const start = () => { if (!t) t = setInterval(load, 20000); };
    const sync = () => {
      if (document.visibilityState === 'visible') { load(); start(); } else stop();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { stop(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  async function onOpenChange(next) {
    setOpen(next);
    if (next && unread > 0) { await api('/notifications/read', { method: 'POST' }).catch(() => {}); setUnread(0); }
  }
  function go(n) { setOpen(false); if (n.link) nav(n.link); }

  // Before the first interaction: the same button, with none of the machinery.
  if (!armed) {
    const arm = () => { setArmed(true); onOpenChange(true); };
    return (
      <div className="notif">
        <NotificationBellButton
          unread={unread}
          onMouseEnter={warm}
          onFocus={warm}
          onClick={arm}
        />
      </div>
    );
  }

  // The fallback is the identical button, so the topbar doesn't shift while
  // the chunk lands.
  return (
    <Suspense fallback={<div className="notif"><NotificationBellButton unread={unread} /></div>}>
      <NotificationPanel
        items={items}
        unread={unread}
        open={open}
        onOpenChange={onOpenChange}
        onPick={go}
      />
    </Suspense>
  );
}

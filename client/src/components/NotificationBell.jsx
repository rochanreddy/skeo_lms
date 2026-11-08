import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearApiCache } from '../api.js';
import { pushState } from '../pwa.js';
import NotificationBellButton from './NotificationBellButton.jsx';

/* How often to ask, when nothing is going to tell us.
 *
 * Every open tab asking three times a minute for one number was the largest
 * standing load this API carried, it runs on a single small instance, and
 * that poll took CPU from the requests someone was actually waiting for.
 *
 * Where push is on, the bell is already event-driven: sw.js posts skeo:push
 * the moment a notification arrives, so the interval is only a safety net for
 * a message the browser dropped, and two minutes is generous for that.
 *
 * Where push is off, notifications declined, or an iPhone still in a Safari
 * tab: polling IS the mechanism, so it stays brisk. 45 seconds rather than
 * the 20 it was: both are longer than anyone watches a bell for, and the
 * count is refreshed immediately on coming back to the tab anyway, which is
 * when it is actually looked at.
 */
const POLL_WITH_PUSH_MS = 120_000;
const POLL_WITHOUT_PUSH_MS = 45_000;

// Live notification bell: polls, shows an unread badge, and a dropdown.
//
// The panel is a Radix Popover, which brings floating-ui and the popper stack
// with it. That's a lot of code for something nobody can see until they click,
// so the button ships eagerly and the panel is fetched on first interaction,
// mounted already-open. Hover and focus both prefetch it, and both precede a
// click, so the chunk is normally warm by the time it's needed.
//
// The polling, the unread count and the mark-read-on-open call stay here, the
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

  // Is a push subscription live on this device? If so the bell hears about
  // notifications as they happen and barely needs to ask. Resolved once;
  // enabling or disabling push remounts nothing, but it is a deliberate act
  // followed by a test push, which refreshes the bell on its own.
  const [hasPush, setHasPush] = useState(false);
  useEffect(() => {
    let live = true;
    pushState().then((s) => { if (live) setHasPush(s === 'on'); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Poll only while the tab is actually being looked at. A backgrounded tab
  // used to keep issuing three requests a minute for a badge nobody could see;
  // coming back to the tab refreshes immediately, so nothing is lost.
  useEffect(() => {
    const every = hasPush ? POLL_WITH_PUSH_MS : POLL_WITHOUT_PUSH_MS;
    let t = null;
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const start = () => { if (!t) t = setInterval(load, every); };
    const sync = () => {
      if (document.visibilityState === 'visible') { load(); start(); } else stop();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { stop(); document.removeEventListener('visibilitychange', sync); };
  }, [hasPush]);

  // A push just arrived (sw.js says so): show it now, not at the next poll.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e) => { if (e.data?.type === 'skeo:push') { clearApiCache(); load(); } };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // The installed app's home-screen icon carries the unread count.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {});
  }, [unread]);

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

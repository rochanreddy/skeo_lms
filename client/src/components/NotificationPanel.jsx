import NotificationBellButton from './NotificationBellButton.jsx';
import { promptInstall, usePush } from '../pwa.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';

// The Radix half of the bell: the popover supplies Escape, focus movement into
// the list and aria-expanded, none of which the hand-rolled overlay ever did.
// Split out of NotificationBell so floating-ui and the popper stack stay off
// the critical path — the polling and the unread count live in the parent.
export default function NotificationPanel({ items, unread, open, onOpenChange, onPick }) {
  return (
    <div className="notif">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <NotificationBellButton unread={unread} />
        </PopoverTrigger>

        <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="notif-menu">
          <div className="notif-head">Notifications</div>
          <PushOffer />
          {items.length === 0 && <div className="notif-empty">You're all caught up 🎉</div>}
          {items.map((n) => (
            <button key={n._id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => onPick(n)}>
              <div className="notif-text">{n.text}</div>
              <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// One line offering lock-screen notifications, only while they're available
// and off. Gone once they're on, and never shown where they can't work.
function PushOffer() {
  const { state, busy, error, enable } = usePush();
  if (state === 'needs-install') {
    return (
      <div className="notif-push">
        <span>Add skeo to your Home Screen to get these on your phone.</span>
        <button type="button" className="btn sm ghost" onClick={promptInstall}>How</button>
      </div>
    );
  }
  if (state !== 'off') return null;
  return (
    <div className="notif-push">
      <span>{error || 'Get these on this device, even with skeo closed.'}</span>
      <button type="button" className="btn sm ghost" onClick={enable} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</button>
    </div>
  );
}

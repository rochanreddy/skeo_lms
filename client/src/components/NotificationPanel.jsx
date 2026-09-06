import NotificationBellButton from './NotificationBellButton.jsx';
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

        <PopoverContent align="end" sideOffset={8} className="notif-menu">
          <div className="notif-head">Notifications</div>
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

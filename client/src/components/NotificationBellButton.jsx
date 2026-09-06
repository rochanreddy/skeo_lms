// The bell trigger, on its own so the same markup serves both the plain button
// that ships in the first paint and the child of Radix's PopoverTrigger once
// the panel has been asked for. See NotificationBell for why they're split.
//
// Props spread last so Radix's handlers, ids and aria-* win. `ref` is an
// ordinary prop (React 19); `asChild` needs it to anchor the popover.
export default function NotificationBellButton({ unread = 0, ref, ...props }) {
  return (
    <button ref={ref} className="notif-btn" title="Notifications" aria-label="Notifications" {...props}>
      <svg className="notif-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" />
        <path d="M13.7 20a2 2 0 0 1-3.4 0" />
      </svg>
      {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

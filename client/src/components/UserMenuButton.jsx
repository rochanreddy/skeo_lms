// The account trigger, on its own so it can be rendered twice: once as the
// plain button that ships in the first paint, and again — same markup, same
// classes — as the child of Radix's DropdownMenuTrigger once the menu has been
// asked for. Keeping one copy is what makes the swap invisible.
//
// Props spread last so Radix's own handlers, ids and aria-* win over anything
// set here. `ref` arrives as an ordinary prop (React 19), which is what
// `asChild` needs to position the menu against this element.
export default function UserMenuButton({ name, initial, role, open = false, ref, ...props }) {
  return (
    <button ref={ref} className={`who-btn ${open ? 'on' : ''}`} aria-label="Account menu" {...props}>
      <span className="avatar">{initial}</span>
      <span className="who-name">{name}</span>
      <span className={`badge badge-${role}`}>{role}</span>
      <svg className={`who-caret ${open ? 'up' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

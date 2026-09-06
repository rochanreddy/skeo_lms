import { Suspense, lazy, useState } from 'react';
import UserMenuButton from './UserMenuButton.jsx';

// The account menu behind the avatar. Logging out used to be reachable only by
// opening ⌘K and typing "log out" — which nobody discovers. Clicking your own
// face is where everyone looks for it, so it lives here.
//
// The menu itself is Radix, which pulls in floating-ui and the whole popper
// stack — around 40 KB that used to load before first paint for a panel that
// isn't on screen until you click it. So the trigger ships eagerly as a plain
// button and the Radix version replaces it on first interaction, mounted
// already-open so the click that armed it is also the click that opens it.
// The chunk is prefetched on hover and on focus, both of which precede the
// click, so in practice it's already there.
const UserMenuPanel = lazy(() => import('./UserMenuPanel.jsx'));
const warm = () => { import('./UserMenuPanel.jsx'); };

export default function UserMenu({ user, logout }) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);

  const name = user.full_name || user.email;
  const initial = (name || '?')[0].toUpperCase();

  // Before the first interaction: the same button, with none of the machinery.
  if (!armed) {
    const arm = () => { setArmed(true); setOpen(true); };
    return (
      <div className="who">
        <UserMenuButton
          name={name}
          initial={initial}
          role={user.role}
          onMouseEnter={warm}
          onFocus={warm}
          onClick={arm}
          // Radix opens a menu on ArrowDown as well as click; match that here
          // so keyboard users don't find the first press does nothing.
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); arm(); } }}
        />
      </div>
    );
  }

  // The fallback is the identical button, so nothing moves while the chunk
  // lands — the only visible change is the menu appearing once it has.
  return (
    <Suspense
      fallback={<div className="who"><UserMenuButton name={name} initial={initial} role={user.role} open /></div>}
    >
      <UserMenuPanel user={user} logout={logout} open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}

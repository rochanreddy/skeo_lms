import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.jsx';

// The account menu behind the avatar. Logging out used to be reachable only by
// opening ⌘K and typing "log out" — which nobody discovers. Clicking your own
// face is where everyone looks for it, so it lives here.
//
// Radix owns the behaviour: outside-click, Escape, focus return to the trigger,
// arrow-key navigation and typeahead all come from DropdownMenu rather than the
// hand-rolled listeners this used to carry. `open` is still tracked locally so
// the trigger keeps its `.on` state and the caret keeps flipping.
export default function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const name = user.full_name || user.email;
  const initial = (name || '?')[0].toUpperCase();
  // Admins get "Account" instead of "Profile" in the dock — match the route.
  const profilePath = user.role === 'admin' ? '/app/account' : '/app/profile';

  return (
    <div className="who">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className={`who-btn ${open ? 'on' : ''}`} aria-label="Account menu">
            <span className="avatar">{initial}</span>
            <span className="who-name">{name}</span>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
            <svg className={`who-caret ${open ? 'up' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={10} className="who-menu">
          <DropdownMenuLabel className="who-menu-head">
            <span className="avatar avatar-lg">{initial}</span>
            <div className="who-menu-id">
              <div className="who-menu-name">{name}</div>
              <div className="who-menu-mail">{user.email}</div>
              <span className={`badge badge-${user.role}`}>{user.role}</span>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="who-menu-sep" />

          <DropdownMenuItem className="who-menu-item" onSelect={() => navigate(profilePath)}>
            <Icon name="profile" />
            <span>Your profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="who-menu-item" onSelect={() => navigate(`${profilePath}#password`)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
            <span>Change password</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="who-menu-sep" />

          <DropdownMenuItem className="who-menu-item danger" onSelect={logout}>
            <Icon name="logout" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

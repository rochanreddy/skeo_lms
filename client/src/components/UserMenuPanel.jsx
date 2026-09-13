import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import UserMenuButton from './UserMenuButton.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.jsx';

// Everything about the account menu that needs Radix — and, through it,
// floating-ui. Split out of UserMenu so none of it sits on the critical path:
// the shell paints a plain button, and this arrives on the first interaction.
//
// Radix still owns the behaviour: outside-click, Escape, focus return to the
// trigger, arrow-key navigation and typeahead.
export default function UserMenuPanel({ user, logout, open, onOpenChange }) {
  const navigate = useNavigate();

  const name = user.full_name || user.email;
  const initial = (name || '?')[0].toUpperCase();
  // Admins get "Account" instead of "Profile" in the dock — match the route.
  const profilePath = user.role === 'admin' ? '/app/account' : '/app/profile';

  return (
    <div className="who">
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <UserMenuButton name={name} initial={initial} role={user.role} open={open} />
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

          {/* Where a student goes when the LMS itself is the problem. Admins
              don't get it here — Support is a dock tab for them, because for
              them it's a queue to work rather than a way out of a dead end. */}
          {user.role !== 'admin' && (
            <>
              <DropdownMenuSeparator className="who-menu-sep" />
              <DropdownMenuItem className="who-menu-item" onSelect={() => navigate('/app/support')}>
                <Icon name="support" />
                <span>Help &amp; support</span>
              </DropdownMenuItem>
            </>
          )}

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

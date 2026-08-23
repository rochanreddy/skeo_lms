import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

// The account menu behind the avatar. Logging out used to be reachable only by
// opening ⌘K and typing "log out" — which nobody discovers. Clicking your own
// face is where everyone looks for it, so it lives here.
export default function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const navigate = useNavigate();

  const name = user.full_name || user.email;
  const initial = (name || '?')[0].toUpperCase();
  // Admins get "Account" instead of "Profile" in the dock — match the route.
  const profilePath = user.role === 'admin' ? '/app/account' : '/app/profile';

  // Close on outside click and on Escape; return focus to the trigger so the
  // keyboard path doesn't dead-end.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (path) => { setOpen(false); navigate(path); };

  return (
    <div className="who" ref={wrapRef}>
      <button
        ref={btnRef}
        className={`who-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="avatar">{initial}</span>
        <span className="who-name">{name}</span>
        <span className={`badge badge-${user.role}`}>{user.role}</span>
        <svg className={`who-caret ${open ? 'up' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="who-menu" role="menu">
          <div className="who-menu-head">
            <span className="avatar avatar-lg">{initial}</span>
            <div className="who-menu-id">
              <div className="who-menu-name">{name}</div>
              <div className="who-menu-mail">{user.email}</div>
              <span className={`badge badge-${user.role}`}>{user.role}</span>
            </div>
          </div>

          <div className="who-menu-sep" />

          <button className="who-menu-item" role="menuitem" onClick={() => go(profilePath)}>
            <Icon name="profile" />
            <span>Your profile</span>
          </button>
          <button className="who-menu-item" role="menuitem" onClick={() => go(`${profilePath}#password`)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
            <span>Change password</span>
          </button>

          <div className="who-menu-sep" />

          <button className="who-menu-item danger" role="menuitem" onClick={() => { setOpen(false); logout(); }}>
            <Icon name="logout" />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}

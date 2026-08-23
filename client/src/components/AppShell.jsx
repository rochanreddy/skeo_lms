import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { navFor } from '../nav.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import SkeoWordmark from './SkeoWordmark.jsx';
import CommandPalette from './CommandPalette.jsx';
import UserMenu from './UserMenu.jsx';

// Show the right modifier in the shortcut hint rather than always "⌘".
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// Wraps every logged-in page. No sidebar: navigation runs along the top bar as
// ruled links — one click, always visible, and the rule marks where you are.
// ⌘K still works for people who reach for it, but it's a shortcut, not the
// primary path; making a modal the only way to move was ceremony around a menu.
export default function AppShell({ user, setUser, logout }) {
  const tabs = navFor(user.role);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const location = useLocation();

  // Landing on a new section should start at the top of it.
  useEffect(() => { setCmdOpen(false); window.scrollTo({ top: 0 }); }, [location.pathname]);

  // ⌘K / Ctrl-K from anywhere, and "/" when not already typing.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((v) => !v); return; }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The bar only grows a border once you've scrolled past the top.
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = cmdOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cmdOpen]);

  return (
    <div className="app">
      <header className={`topbar ${stuck ? 'stuck' : ''}`}>
        <div className="brand"><SkeoWordmark size={22} /></div>

        <div className="spacer" />

        {/* A field, not an icon. Search is the fastest route to anything in the
            product, so it should look like something you can type into. */}
        <button className="search-trigger" onClick={() => setCmdOpen(true)} aria-label="Search" title="Search (⌘K)">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <span className="search-trigger-text">Search anything…</span>
          <kbd className="kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <NotificationBell />

        <UserMenu user={user} logout={logout} />
      </header>

      {/* keyed on the route so each page fades in — movement between sections
          reads as a change of place rather than a flicker. */}
      <main className="main page-enter" key={location.pathname}>
        <Suspense fallback={<div className="route-loading"><div className="skeleton"><div className="skeleton-row tall" /><div className="skeleton-row" /><div className="skeleton-row" /></div></div>}>
          <Outlet context={{ user, setUser, logout }} />
        </Suspense>
      </main>

      {/* The dock. Icons always; only the active item expands to show its
          label, which keeps it compact regardless of how many sections a role
          has. Same component and position on mobile — one pattern everywhere. */}
      <nav className="dock" aria-label="Main">
        {tabs.map((t) => (
          <NavLink
            key={t.path}
            to={t.path ? `/app/${t.path}` : '/app'}
            end={t.path === ''}
            className={({ isActive }) => `dock-item ${isActive ? 'on' : ''}`}
            title={t.label}
            aria-label={t.label}
          >
            <Icon name={t.label} />
            <span className="dock-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} tabs={tabs} onLogout={logout} />
    </div>
  );
}

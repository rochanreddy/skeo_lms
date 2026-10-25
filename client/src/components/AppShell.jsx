import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { navFor } from '../nav.jsx';
import Icon from './Icon.jsx';
import InstallNudge from './InstallNudge.jsx';
import NotificationBell from './NotificationBell.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import SkeoWordmark from './SkeoWordmark.jsx';
import UserMenu from './UserMenu.jsx';
import { syncPush } from '../pwa.js';

// The palette is a modal that nothing renders until it's asked for, and it
// drags in the whole Radix Dialog stack (focus trap, scroll lock, portal).
// None of that belongs on first paint. The search field below is a plain
// button, so the entry point stays instant; the chunk is warmed on hover and
// on focus, which is always at least one interaction ahead of the click.
const CommandPalette = lazy(() => import('./CommandPalette.jsx'));
const warmPalette = () => { import('./CommandPalette.jsx'); };

// Show the right modifier in the shortcut hint rather than always "⌘".
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// Wraps every logged-in page. No sidebar: navigation runs along the top bar as
// ruled links — one click, always visible, and the rule marks where you are.
// ⌘K still works for people who reach for it, but it's a shortcut, not the
// primary path; making a modal the only way to move was ceremony around a menu.
export default function AppShell({ user, setUser, logout }) {
  const tabs = navFor(user.role);
  const [cmdOpen, setCmdOpen] = useState(false);
  // Latches on the first open and stays latched — see the mount note below.
  const [everOpened, setEverOpened] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Phones show the first DOCK_PRIMARY tabs and a "More" button for the rest:
  // a scrolling dock hid sections past the edge with nothing to say they were
  // there. The stylesheet decides when (only on narrow screens), so the dock
  // markup is the same everywhere and desktop keeps every tab in view.
  const DOCK_PRIMARY = 4;
  const hasMore = tabs.length > DOCK_PRIMARY + 1;
  const extraTabs = hasMore ? tabs.slice(DOCK_PRIMARY) : [];
  const onExtra = extraTabs.some((t) => t.path && location.pathname.startsWith(`/app/${t.path}`));

  useEffect(() => { if (cmdOpen) setEverOpened(true); }, [cmdOpen]);

  // A device that already allows notifications gets filed under whoever is
  // signed in now (see syncPush).
  useEffect(() => { syncPush(); }, [user.id]);

  // Landing on a new section should start at the top of it.
  useEffect(() => { setCmdOpen(false); setMoreOpen(false); window.scrollTo({ top: 0 }); }, [location.pathname]);

  // The More sheet closes on Escape, like every other panel.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // ⌘K / Ctrl-K from anywhere, and "/" when not already typing. The chunk is
  // fetched once the shell is idle so the shortcut never waits on the network —
  // it has no on-screen trigger to hover first.
  useEffect(() => {
    // requestIdleCallback is still missing on older Safari — a bare reference
    // would throw, so it's feature-detected rather than assumed.
    const idle = typeof requestIdleCallback === 'function';
    const id = idle ? requestIdleCallback(warmPalette) : setTimeout(warmPalette, 1500);
    return () => (idle ? cancelIdleCallback(id) : clearTimeout(id));
  }, []);

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

  return (
    <div className="app">
      <header className={`topbar ${stuck ? 'stuck' : ''}`}>
        <div className="brand"><SkeoWordmark size={22} /></div>

        <div className="spacer" />

        {/* A field, not an icon. Search is the fastest route to anything in the
            product, so it should look like something you can type into. */}
        <button
          className="search-trigger"
          onClick={() => setCmdOpen(true)}
          onMouseEnter={warmPalette}
          onFocus={warmPalette}
          aria-label="Search"
          title="Search (⌘K)"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <span className="search-trigger-text">Search anything…</span>
          <kbd className="kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <ThemeToggle />

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
      <nav className={`dock ${hasMore ? 'has-more' : ''}`} aria-label="Main">
        {tabs.map((t, i) => (
          <NavLink
            key={t.path}
            to={t.path ? `/app/${t.path}` : '/app'}
            end={t.path === ''}
            className={({ isActive }) => `dock-item ${isActive ? 'on' : ''} ${hasMore && i >= DOCK_PRIMARY ? 'dock-extra' : ''}`}
            title={t.label}
            aria-label={t.label}
          >
            <Icon name={t.label} />
            <span className="dock-label">{t.label}</span>
          </NavLink>
        ))}
        {hasMore && (
          <button
            type="button"
            className={`dock-item dock-more ${moreOpen || onExtra ? 'on' : ''}`}
            aria-expanded={moreOpen}
            aria-controls="dock-more-sheet"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
            </svg>
            <span className="dock-label">More</span>
          </button>
        )}
      </nav>

      {/* The rest of the sections, as a sheet above the dock (phones only). */}
      {hasMore && moreOpen && (
        <>
          <div className="dock-sheet-scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="dock-sheet" id="dock-more-sheet" role="menu" aria-label="More sections">
            {extraTabs.map((t) => (
              <NavLink
                key={t.path}
                to={`/app/${t.path}`}
                role="menuitem"
                className={({ isActive }) => `dock-sheet-item ${isActive ? 'on' : ''}`}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={t.label} />
                <span>{t.label}</span>
              </NavLink>
            ))}
          </div>
        </>
      )}

      <InstallNudge />

      {/* Mounted from the first open onwards, not on every open: unmounting on
          close would cut off Radix's exit animation. `null` is the right
          fallback because a closed modal has no in-page footprint to reserve. */}
      {everOpened && (
        <Suspense fallback={null}>
          <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} tabs={tabs} user={user} onLogout={logout} />
        </Suspense>
      )}
    </div>
  );
}

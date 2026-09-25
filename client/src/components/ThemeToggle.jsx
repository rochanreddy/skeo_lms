import { useEffect, useState } from 'react';

/**
 * Day / night — the website's toggle (skeo_web src/components/ThemeToggle.tsx),
 * with the same two palettes: Claude by day, Charcoal by night. It writes
 * `data-palette` on <html>, which is what every palette block in styles.css
 * keys off, so switching is a repaint and nothing re-renders.
 *
 * The key is the website's, and index.html applies the stored choice before
 * first paint, so a returning night-mode student never sees a light flash.
 */
export const THEME_KEY = 'skeo-palette';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('claude');

  useEffect(() => {
    setTheme(document.documentElement.dataset.palette === 'charcoal' ? 'charcoal' : 'claude');
  }, []);

  function choose(next) {
    document.documentElement.dataset.palette = next;
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Private browsing. The choice still applies for this visit. */
    }
  }

  const night = theme === 'charcoal';

  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={night}
      aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
      title={night ? 'Day mode' : 'Night mode'}
      onClick={() => choose(night ? 'claude' : 'charcoal')}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        {/* The knob rides over the two icons rather than between them, so the
            one it covers reads as unselected without needing a second colour. */}
        <span className="theme-toggle-knob" />
      </span>
    </button>
  );
}

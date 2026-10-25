import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

// The app-level PWA surfaces, mounted once at the root so they work on the
// sign-in screen as well as inside the app:
//   · "new version" toast when a deploy is waiting
//   · an offline notice
//   · the iPhone "Add to Home Screen" steps (iOS has no install dialog)
//   · moving to the screen a tapped notification points at
export default function PwaPrompts() {
  const navigate = useNavigate();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [iosHelp, setIosHelp] = useState(false);

  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // An installed app can stay open for days. Look for a new build hourly
      // and whenever it comes back to the foreground.
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
  });

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    const help = () => setIosHelp(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('skeo:ios-install', help);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('skeo:ios-install', help);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data?.type === 'skeo:navigate' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) navigate(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    if (!iosHelp) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setIosHelp(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [iosHelp]);

  return (
    <>
      {offline && (
        <div className="pwa-offline" role="status">
          <span className="pwa-offline-dot" aria-hidden="true" />
          Offline. Reconnect to load new content.
        </div>
      )}

      {needRefresh && (
        <div className="pwa-toast" role="alert">
          <div className="pwa-toast-text">
            <strong>A new version of skeo is ready.</strong>
            <span>Refresh to get it. Save anything you’re writing first.</span>
          </div>
          <div className="pwa-toast-actions">
            <button type="button" className="btn sm quiet" onClick={() => setNeedRefresh(false)}>Later</button>
            <button type="button" className="btn sm" onClick={() => updateServiceWorker(true)}>Refresh</button>
          </div>
        </div>
      )}

      {iosHelp && (
        <>
          <div className="pwa-sheet-scrim" onClick={() => setIosHelp(false)} aria-hidden="true" />
          <div className="pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
            <div className="pwa-sheet-head">
              <img src="/icons/icon-192.png" alt="" width="44" height="44" />
              <div>
                <h3 id="ios-install-title">Add skeo to your Home Screen</h3>
                <p className="muted">It opens like an app, and can send you notifications.</p>
              </div>
            </div>
            <ol className="pwa-steps">
              <li>
                Tap <strong>Share</strong>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-label="the Share icon">
                  <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
                </svg>
                in the browser bar
              </li>
              <li>Choose <strong>Add to Home Screen</strong> (scroll down if you don’t see it)</li>
              <li>Tap <strong>Add</strong>, then open skeo from your Home Screen</li>
            </ol>
            <button type="button" className="btn" onClick={() => setIosHelp(false)}>Got it</button>
          </div>
        </>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import IosInstallSteps from './IosInstallSteps.jsx';

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
  const [updating, setUpdating] = useState(false);

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

      {/* The whole screen, so an update can't be missed. "Later" stays: an
          update reloads the app, and someone halfway through a submission
          must be able to finish it first. It comes back on the next launch. */}
      {needRefresh && (
        <div className="pwa-update" role="dialog" aria-modal="true" aria-labelledby="pwa-update-title">
          <div className="pwa-update-body">
            <img src="/icons/icon-192.png" alt="" width="88" height="88" />
            <h2 id="pwa-update-title">A new version of skeo is here</h2>
            <p>Update to get the latest fixes and features. It only takes a second.</p>
            <button
              type="button"
              className="btn pwa-update-go"
              disabled={updating}
              onClick={() => { setUpdating(true); updateServiceWorker(true); }}
            >
              {updating ? 'Updating…' : 'Update now'}
            </button>
            {!updating && (
              <button type="button" className="pwa-update-later" onClick={() => setNeedRefresh(false)}>
                Later. I’m in the middle of something
              </button>
            )}
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
            <IosInstallSteps />
            <button type="button" className="btn" onClick={() => setIosHelp(false)}>Got it</button>
          </div>
        </>
      )}
    </>
  );
}

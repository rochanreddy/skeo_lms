import { useEffect, useState } from 'react';
import { promptInstall, useInstall } from '../pwa.js';

// A one-line offer to install, on phones only, a few seconds into a signed-in
// visit. Dismissing it keeps it away for two weeks; installing ends it for good.
// The same action stays available in the account menu and on the profile.
const KEY = 'skeo-install-dismissed';
const QUIET_MS = 14 * 24 * 3600 * 1000;

const dismissedRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < QUIET_MS; } catch { return false; }
};

export default function InstallNudge() {
  const { canInstall } = useInstall();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!canInstall || dismissedRecently() || !window.matchMedia('(max-width: 900px)').matches) return undefined;
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, [canInstall]);

  if (!show || !canInstall) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="pwa-nudge" role="complementary" aria-label="Install skeo">
      <img src="/icons/icon-192.png" alt="" width="40" height="40" />
      <div className="pwa-nudge-text">
        <strong>Get the skeo app</strong>
        <span>One tap from your home screen, with notifications.</span>
      </div>
      <button type="button" className="btn sm" onClick={() => { setShow(false); promptInstall(); }}>Install</button>
      <button type="button" className="pwa-nudge-close" onClick={dismiss} aria-label="Not now">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}

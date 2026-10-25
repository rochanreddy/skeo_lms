// Everything the app knows about being installed: the install prompt, push
// notifications, and recovering from a deploy. Imported first thing in
// main.jsx, because the browser fires `beforeinstallprompt` once, early, and
// a listener added later never hears it.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';

// ── Small store: components re-render when install or push state changes ──
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let version = 0;
const bump = () => { version += 1; emit(); };

// ── Install ──────────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Keep Chrome's own mini-bar away; the app offers install at a better moment.
  e.preventDefault();
  deferredPrompt = e;
  bump();
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; bump(); });

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPadOS reports itself as a Mac; the touch screen gives it away.
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Show the install dialog. Chrome, Edge and Samsung Internet have a real one;
 * iOS has none, so there the app opens its own "Add to Home Screen" steps.
 * Resolves true if the app was installed.
 */
export async function promptInstall() {
  if (deferredPrompt) {
    const e = deferredPrompt;
    deferredPrompt = null; // a prompt can only be used once
    bump();
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
  }
  if (isIOS()) window.dispatchEvent(new Event('skeo:ios-install'));
  return false;
}

/** { installed, canInstall } for the install buttons. */
export function useInstall() {
  useSyncExternalStore(subscribe, () => version);
  const installed = isStandalone();
  return { installed, canInstall: !installed && (Boolean(deferredPrompt) || isIOS()) };
}

// ── Recovering from a deploy ─────────────────────────────────────────────
// A tab left open across a deploy can ask for a code-split chunk the server no
// longer has. Vite reports it here; one reload fetches the current build. The
// flag stops a genuinely broken build from reloading forever.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('skeo-reloaded')) return;
    sessionStorage.setItem('skeo-reloaded', '1');
  } catch { /* storage blocked: reload anyway, once per page */ }
  e.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem('skeo-reloaded'); } catch { /* ignore */ } }, 10_000);
});

// ── Push notifications ───────────────────────────────────────────────────
// Set to 'off' when someone turns notifications off on this device, so the
// next sign-in does not quietly turn them back on.
const PREF_KEY = 'skeo-push';
const getPref = () => { try { return localStorage.getItem(PREF_KEY); } catch { return null; } };
const setPref = (v) => { try { if (v) localStorage.setItem(PREF_KEY, v); else localStorage.removeItem(PREF_KEY); } catch { /* ignore */ } };

const hasPushApi = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let keyPromise = null;
function serverKey() {
  if (!keyPromise) {
    keyPromise = api('/push/key').catch(() => { keyPromise = null; return { enabled: false, publicKey: '' }; });
  }
  return keyPromise;
}

// The service worker only exists in a production build. Without one, push
// can't work, and `serviceWorker.ready` would wait forever.
const registration = () => (hasPushApi() ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined));

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sameKey = (buf, bytes) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

/** The browser subscription for the server's current key, made if need be. */
async function ensureSubscription(reg, publicKey) {
  const want = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Made with a key the server no longer uses (keys were replaced): it can
  // never receive anything, so swap it for a fresh one.
  if (sub && !sameKey(sub.options?.applicationServerKey, want)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
  await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return sub;
}

/**
 * Where this device stands:
 *   'unsupported'    no push in this browser (or a dev build, with no worker)
 *   'needs-install'  iPhone / iPad in a Safari tab: push only works once the
 *                    app is on the home screen
 *   'unavailable'    the server has no push keys configured
 *   'denied'         the student blocked notifications in browser settings
 *   'on' | 'off'
 */
export async function pushState() {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!hasPushApi()) return 'unsupported';
  const [reg, key] = await Promise.all([registration(), serverKey()]);
  if (!reg) return 'unsupported';
  if (!key.enabled) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Ask permission, subscribe, register with the server, send a test push. */
export async function enablePush() {
  const reg = await registration();
  const key = await serverKey();
  if (!reg || !key.enabled) throw new Error('Notifications aren’t available here.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked. Allow them for this site in your browser settings.'
      : 'Notifications weren’t turned on.');
  }
  await ensureSubscription(reg, key.publicKey);
  setPref(null);
  bump();
  api('/push/test', { method: 'POST' }).catch(() => {});
}

export async function disablePush() {
  setPref('off');
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  bump();
}

/**
 * On every signed-in launch: if this device already allows notifications,
 * make sure the server has its current subscription, filed under whoever is
 * signed in now. Browsers rotate subscriptions without saying so; this is how
 * a rotated one finds its way back.
 */
export async function syncPush() {
  try {
    if (getPref() === 'off' || !hasPushApi() || Notification.permission !== 'granted') return;
    const [reg, key] = await Promise.all([registration(), serverKey()]);
    if (!reg || !key.enabled) return;
    await ensureSubscription(reg, key.publicKey);
    bump();
  } catch { /* a background chore; the settings screen shows any real problem */ }
}

/**
 * Before signing out: take this device off the account, so the next person to
 * sign in on a shared phone doesn't receive the last one's notifications.
 * Capped at two seconds so a dead connection can't hold up signing out.
 */
export async function forgetDevice() {
  const work = (async () => {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  })().catch(() => {});
  await Promise.race([work, new Promise((r) => setTimeout(r, 2000))]);
}

// A session that ended some other way (expired, blocked) leaves no token to
// tell the server with, so the subscription is dropped on the device alone.
// The server prunes its copy the next time a send to it fails.
window.addEventListener('skeo:signed-out', () => {
  registration()
    .then((reg) => reg?.pushManager.getSubscription())
    .then((sub) => sub?.unsubscribe())
    .catch(() => {});
});

/** Push state plus on/off actions, for the settings row and the bell. */
export function usePush() {
  const v = useSyncExternalStore(subscribe, () => version);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    pushState().then((s) => { if (live) setState(s); }).catch(() => { if (live) setState('unsupported'); });
    return () => { live = false; };
  }, [v]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message || 'Something went wrong.'); bump(); } finally { setBusy(false); }
  }, []);

  return {
    state,
    busy,
    error,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  };
}

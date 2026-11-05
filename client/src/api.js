// Thin fetch wrapper — this is the ENTIRE link between the frontend and the
// backend: it sends requests to VITE_API_URL with the stored Bearer token.
// 4200 is Skeo's own port. It used to fall back to 4100, which is menler-lms:
// with VITE_API_URL unset the app pointed at a different product's API, and the
// only symptom was every request failing as a network error.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4200/api/skeo').replace(/\/+$/, '');

const TOKEN_KEY = 'skeo_token';
const REFRESH_KEY = 'skeo_refresh';
const USER_KEY = 'skeo_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) || '';
}

/* ── Who we were last time ────────────────────────────────────────────────
 *
 * The app's first act is to ask /me, because the answer decides which
 * dashboard to render. That is one cross-origin round trip to Singapore
 * before a single pixel of the real app can appear — and if the API instance
 * happens to be asleep, considerably more than one round trip's worth.
 * Everything behind it waits on it.
 *
 * So the answer is remembered. On the next launch the app renders the right
 * dashboard immediately from this, and asks /me in the background to confirm
 * it. That is the difference between a skeleton for the length of a round
 * trip and the real screen at once.
 *
 * What it is NOT is an authority. It picks which chrome to draw, nothing
 * more: every piece of data on the page is still fetched with the token and
 * still authorised by the server, so a remembered record that is out of date
 * costs a wrong-looking dock for one round trip and can never show data the
 * account is not entitled to. App.jsx honours a remembered block immediately
 * and waits for the server before trusting the absence of one, so the
 * staleness only ever errs towards less access, not more.
 *
 * Cleared by setToken('') below, which is the single door out of a session.
 */
export function getCachedUser() {
  // No token means no session to describe, whatever is left in storage.
  if (!getToken()) return null;
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return u && u.id && u.role ? u : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* private mode, or the quota is full: the app works without it */ }
}

/**
 * Store the session. Three shapes, deliberately:
 *   setToken(access, refresh) — signing in, both are new
 *   setToken(access)          — after a refresh, keep the refresh token we have
 *   setToken('')              — signing out, drop both
 */
export function setToken(t, refreshToken) {
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    // The remembered identity goes with the session, so the next person to
    // open this app on a shared phone is not greeted by the last one's name.
    setCachedUser(null);
    // pwa.js drops this device's push subscription, so a shared phone stops
    // receiving the last person's notifications.
    window.dispatchEvent(new Event('skeo:signed-out'));
  }
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  // Whoever we were, we aren't any more — nothing read as them may be reused.
  clearApiCache();
}

// GET de-duplication + a very short freshness window.
//
// Several screens legitimately want the same data at the same moment — the
// notification bell and the student home both read /notifications, Learning
// and the home both read /programs. Without this each mount paid for its own
// round trip. Two rules, both deliberately conservative:
//
//   · one in-flight GET per URL — concurrent callers share the same promise
//   · a resolved GET is reused for TTL ms, then forgotten
//
// Anything that isn't a GET clears the cache, so a write is always followed by
// fresh reads. TTL is short enough that no screen can show stale data a user
// would notice, and long enough to collapse a burst of mounts into one request.
const TTL = 5000;
const cache = new Map();      // path -> { at, data }
const inflight = new Map();   // path -> Promise

export function clearApiCache() {
  cache.clear();
  inflight.clear();
}

// ── Silent access-token renewal ──────────────────────────────────────────
//
// Access tokens last 2h; the refresh token issued alongside them lasts 30d.
// Without this the 2h expiry was a hard logout — the user was bounced to the
// sign-in screen and paid another bcrypt hash, which on a one-core box is the
// most expensive thing the API does.
//
// Single-flight: a burst of requests all expiring at once must mint ONE new
// token between them, not one each.
let refreshing = null;

async function renewAccessToken() {
  if (!getRefreshToken()) return false;
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: getRefreshToken() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.accessToken) {
        // The refresh token itself is rejected — expired, or the account was
        // blocked or retired. The session is genuinely over; don't loop.
        if (data.code === 'blocked') {
          window.dispatchEvent(new CustomEvent('skeo:blocked', { detail: { message: data.error } }));
        }
        setToken('');
        return false;
      }
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      return true;
    })()
      .catch(() => false) // a network failure here is not proof the session ended
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// What the hosting proxy answers while the API behind it restarts or redeploys.
// These are about the instance, not the request, and they pass in seconds.
const GATEWAY_ERRORS = new Set([502, 503, 504]);
const backoff = (attempt) => new Promise((r) => { setTimeout(r, 250 * (attempt + 1)); });

async function request(path, { method = 'GET', body, retriedAuth = false } = {}) {
  let lastErr;
  // Retry transient failures: a network error (connection reset before the
  // request lands, common on localhost) or a gateway error. Anything else the
  // API itself said is an answer, and is NOT retried.
  //
  // GETs only. A write that never came back may still have been applied, and
  // the create endpoints (/batches, /programs, /announcements, /jobs, /library)
  // carry no uniqueness constraint — replaying one duplicates the record.
  const attempts = method === 'GET' ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (method === 'GET' && GATEWAY_ERRORS.has(res.status) && attempt < attempts - 1) {
        await backoff(attempt);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // An expired access token → renew once and replay. Skipped for /auth/*,
        // where a 401 means "wrong password", not "stale token".
        if (res.status === 401 && !retriedAuth && !path.startsWith('/auth/') && getRefreshToken()) {
          if (await renewAccessToken()) {
            return request(path, { method, body, retriedAuth: true });
          }
        }
        // Admin blocked this account mid-session → tell the app shell so it can
        // swap to the "account blocked" screen instead of a dead error toast.
        if (data.code === 'blocked') {
          window.dispatchEvent(new CustomEvent('skeo:blocked', { detail: { message: data.error } }));
        }
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.code = data.code;
        err.status = res.status;
        err.http = true; // marks it as "the server answered", see the catch
        throw err;
      }
      return data;
    } catch (e) {
      // An HTTP error we generated above → don't retry, surface it. This used
      // to sniff the message text, which only matched the fallback string —
      // any error the server supplied a message for looked like a network
      // failure and was retried three times with backoff.
      if (e.http) throw e;
      lastErr = e; // network error → retry
      if (attempt < attempts - 1) await backoff(attempt);
    }
  }
  throw lastErr;
}

export function api(path, opts = {}) {
  const method = opts.method || 'GET';
  if (method !== 'GET') {
    // A write invalidates everything — the next read of any list re-fetches.
    return request(path, opts).finally(clearApiCache);
  }

  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);

  const pending = inflight.get(path);
  if (pending) return pending;

  const p = request(path, opts)
    .then((data) => { cache.set(path, { at: Date.now(), data }); return data; })
    // A failed GET must not be remembered, or a transient error would be
    // replayed to every later caller for the whole TTL.
    .finally(() => { inflight.delete(path); });

  inflight.set(path, p);
  return p;
}

// POST a File (multipart, field "file") to any endpoint → parsed JSON.
// These two bypass request() because their bodies aren't JSON, so they renew an
// expired token themselves — otherwise an upload begun after the 2h mark fails
// on a session that is actually still good.
export async function postFile(path, file) {
  const send = () => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: fd,
    });
  };
  let res = await send();
  if (res.status === 401 && (await renewAccessToken())) res = await send();
  const data = await res.json().catch(() => ({}));
  clearApiCache(); // an upload is a write like any other
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Download an authenticated file (CSV reports) and trigger a browser save.
export async function downloadFile(path, fallbackName = 'report.csv') {
  const send = () => fetch(`${API}${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  let res = await send();
  if (res.status === 401 && (await renewAccessToken())) res = await send();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

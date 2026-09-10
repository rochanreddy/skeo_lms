// Thin fetch wrapper — this is the ENTIRE link between the frontend and the
// backend: it sends requests to VITE_API_URL with the stored Bearer token.
// 4200 is Skeo's own port. It used to fall back to 4100, which is menler-lms:
// with VITE_API_URL unset the app pointed at a different product's API, and the
// only symptom was every request failing as a network error.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4200/api/skeo').replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem('skeo_token') || '';
}
export function setToken(t) {
  if (t) localStorage.setItem('skeo_token', t);
  else localStorage.removeItem('skeo_token');
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

async function request(path, { method = 'GET', body } = {}) {
  let lastErr;
  // Retry transient NETWORK failures (connection reset before the request lands —
  // common on localhost). HTTP error responses are NOT retried. All our writes
  // are idempotent, so a retry is safe.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Admin blocked this account mid-session → tell the app shell so it can
        // swap to the "account blocked" screen instead of a dead error toast.
        if (data.code === 'blocked') {
          window.dispatchEvent(new CustomEvent('skeo:blocked', { detail: { message: data.error } }));
        }
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.code = data.code;
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
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
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
export async function postFile(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  clearApiCache(); // an upload is a write like any other
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Download an authenticated file (CSV reports) and trigger a browser save.
export async function downloadFile(path, fallbackName = 'report.csv') {
  const res = await fetch(`${API}${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
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

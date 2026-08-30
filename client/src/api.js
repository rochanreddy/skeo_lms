// Thin fetch wrapper — this is the ENTIRE link between the frontend and the
// backend: it sends requests to VITE_API_URL with the stored Bearer token.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api/skeo').replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem('skeo_token') || '';
}
export function setToken(t) {
  if (t) localStorage.setItem('skeo_token', t);
  else localStorage.removeItem('skeo_token');
}

export async function api(path, { method = 'GET', body } = {}) {
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
        throw err;
      }
      return data;
    } catch (e) {
      // An HTTP error we generated above → don't retry, surface it.
      if (/^Request failed/.test(e.message || '')) throw e;
      lastErr = e; // network error → retry
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
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

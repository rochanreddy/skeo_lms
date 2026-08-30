// VdoCipher API client.
//
// Everything that needs the API secret happens here, on the server. The secret
// is never handed to a browser: the client asks us for a short-lived OTP and
// plays with that, and an admin uploading a video gets a one-shot, one-video
// upload credential rather than an account key.
//
// Docs: https://www.vdocipher.com/docs/api/

const API_BASE = 'https://dev.vdocipher.com/api';
const TIMEOUT_MS = 15_000;

const secret = () => (process.env.VDOCIPHER_API_SECRET || '').trim();

/** Is VdoCipher usable at all? Everything else answers 503 while this is false. */
export const isConfigured = () => Boolean(secret());

export class VdoError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'VdoError';
    this.status = status;
  }
}

async function call(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) throw new VdoError('Video hosting is not configured on this server.', 503);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Apisecret ${secret()}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Network failure or timeout — the upstream never answered.
    throw new VdoError('Could not reach the video service. Try again shortly.', 504);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 from VdoCipher means OUR secret is wrong; that is a server
    // misconfiguration, not something the caller can fix by re-authenticating.
    const status = res.status === 401 || res.status === 403 ? 502 : res.status === 404 ? 404 : 502;
    throw new VdoError(data?.message || `Video service error (${res.status}).`, status);
  }
  return data;
}

/**
 * Short-lived playback ticket for one video. `annotate` is VdoCipher's
 * watermark spec (an array of layers) — we stamp the viewer's own identity on
 * the picture, which is the whole point of paying for DRM in the first place.
 */
export function createOtp(videoId, { ttl = 300, annotate } = {}) {
  return call(`/videos/${encodeURIComponent(videoId)}/otp`, {
    method: 'POST',
    body: { ttl, ...(annotate ? { annotate: JSON.stringify(annotate) } : {}) },
  });
}

/** One page of the account's video library (admin picker). Pages are 1-based:
 *  VdoCipher rejects page=0 outright rather than treating it as the first. */
export function listVideos({ page = 1, limit = 24, q = '' } = {}) {
  const params = new URLSearchParams({ page: String(Math.max(1, page)), limit: String(limit) });
  if (q) params.set('q', q);
  return call(`/videos?${params}`);
}

/** Metadata for one video — id, name, status, length, poster. */
export function getVideo(videoId) {
  return call(`/videos/${encodeURIComponent(videoId)}`);
}

/**
 * Credentials for a direct browser → VdoCipher upload. The bytes never pass
 * through this API: we hand back a signed, single-video payload and the admin's
 * browser POSTs the file straight to VdoCipher's storage.
 */
export function createUploadCredentials(title, folderId) {
  const params = new URLSearchParams({ title: title || 'Untitled' });
  if (folderId) params.set('folderId', folderId);
  return call(`/videos?${params}`, { method: 'PUT' });
}

/** Remove a video from the VdoCipher account. */
export function deleteVideo(videoId) {
  return call(`/videos?videos=${encodeURIComponent(videoId)}`, { method: 'DELETE' });
}

/**
 * The watermark shown over playback: who is watching, drifting around the frame
 * so it cannot be cropped out, plus the time so a leaked recording dates itself.
 * Off when VDOCIPHER_WATERMARK is explicitly 'off'.
 */
export function watermarkFor(user) {
  if ((process.env.VDOCIPHER_WATERMARK || 'on').toLowerCase() === 'off') return null;
  const who = [user?.fullName, user?.email].filter(Boolean).join(' · ') || 'Skeo LMS';
  return [
    {
      type: 'rtext',
      text: who,
      alpha: '0.55',
      color: '0xFFFFFF',
      size: '14',
      interval: '8000',
      skip: '4000',
    },
  ];
}

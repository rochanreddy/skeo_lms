/* The arithmetic behind the lesson player, kept apart from the component so it
 * can be tested without a browser or a video.
 */

export const SKIP_SECONDS = 10;
export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const API_SCRIPT = 'https://player.vdocipher.com/v2/api.js';

/** 83 -> "1:23", 3725 -> "1:02:05". Anything unusable is "0:00". */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** For a screen reader: "2 minutes 5 seconds". */
export function spokenTime(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s % 60 || !parts.length) parts.push(`${s % 60} second${s % 60 === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** The buffered end nearest the playhead, from whatever shape the player gives. */
export function bufferedEnd(buffered, at = 0) {
  if (!buffered) return 0;
  const ranges = typeof buffered.length === 'number' && typeof buffered.end === 'function'
    ? Array.from({ length: buffered.length }, (_, i) => ({ start: buffered.start(i), end: buffered.end(i) }))
    : Array.isArray(buffered) ? buffered : [];
  let best = 0;
  for (const r of ranges) {
    if (r.start <= at + 0.5 && r.end > best) best = r.end;
  }
  return best;
}

/* Where to pick a lesson up. Nobody wants to rewatch the first few seconds,
 * and nobody wants to be dropped on the credits, so a position only counts
 * when it is well inside the video. */
export function resumePoint(saved, duration) {
  const s = Number(saved);
  if (!Number.isFinite(s) || !Number.isFinite(duration) || duration <= 0) return 0;
  if (s < 10 || s > duration - 15) return 0;
  return s;
}

/** What a key does, or null. `shift` matters for < and >. */
export function keyAction(key, { shift = false } = {}) {
  switch (key) {
    case ' ': case 'k': case 'K': return { type: 'toggle' };
    case 'ArrowLeft': return { type: 'seek', by: -5 };
    case 'ArrowRight': return { type: 'seek', by: 5 };
    case 'j': case 'J': return { type: 'seek', by: -SKIP_SECONDS };
    case 'l': case 'L': return { type: 'seek', by: SKIP_SECONDS };
    case 'ArrowUp': return { type: 'volume', by: 0.1 };
    case 'ArrowDown': return { type: 'volume', by: -0.1 };
    case 'm': case 'M': return { type: 'mute' };
    case 'f': case 'F': return { type: 'fullscreen' };
    case 'c': case 'C': return { type: 'captions' };
    case 'Home': return { type: 'seekTo', fraction: 0 };
    case 'End': return { type: 'seekTo', fraction: 1 };
    case '<': case ',': return shift || key === '<' ? { type: 'rate', step: -1 } : null;
    case '>': case '.': return shift || key === '>' ? { type: 'rate', step: 1 } : null;
    default:
      if (/^[0-9]$/.test(key)) return { type: 'seekTo', fraction: Number(key) / 10 };
      return null;
  }
}

/** The next speed in the list, held at the ends. */
export function stepRate(rate, step) {
  const i = RATES.indexOf(rate);
  const from = i === -1 ? RATES.indexOf(1) : i;
  return RATES[clamp(from + step, 0, RATES.length - 1)];
}

/* Positions and the chosen speed live in the browser, so they survive a
 * reload but never become a request. Storage can be missing or full, and
 * neither should stop a video playing. */
const POSITION = (videoId) => `skeo_vpos:${videoId}`;
const RATE = 'skeo_vrate';

export function readPosition(videoId) {
  try { return Number(localStorage.getItem(POSITION(videoId))) || 0; } catch { return 0; }
}
export function writePosition(videoId, seconds) {
  try { localStorage.setItem(POSITION(videoId), String(Math.floor(seconds))); } catch { /* nothing to do */ }
}
export function clearPosition(videoId) {
  try { localStorage.removeItem(POSITION(videoId)); } catch { /* nothing to do */ }
}
export function readRate() {
  try {
    const r = Number(localStorage.getItem(RATE));
    return RATES.includes(r) ? r : 1;
  } catch { return 1; }
}
export function writeRate(rate) {
  try { localStorage.setItem(RATE, String(rate)); } catch { /* nothing to do */ }
}

/* VdoCipher's player API, loaded once. It is a plain script that sets
 * window.VdoPlayer, so this is a script tag and a promise around it. */
let loading = null;
export function loadPlayerApi({ doc = document, win = window } = {}) {
  if (win.VdoPlayer) return Promise.resolve(win.VdoPlayer);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = API_SCRIPT;
    script.async = true;
    script.onload = () => (win.VdoPlayer ? resolve(win.VdoPlayer) : reject(new Error('The player API did not load.')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('The player could not be loaded. Check your connection and try again.'));
    };
    doc.head.appendChild(script);
  });
  return loading;
}

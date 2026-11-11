// A YouTube video id from whatever an admin pasted: a watch, share, embed,
// shorts or live link, or the bare 11-character id. '' if it is none of them.
// Mirrors client/src/lib/youtube.js; the schema stores only the id.
const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (ID.test(s)) return s;
  let url;
  try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return ''; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    if (!id) {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && ID.test(id) ? id : '';
}

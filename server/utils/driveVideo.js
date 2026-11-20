// Lesson videos kept in Google Drive. Mirrors client/src/lib/drive.js.
//
// No Google API key anywhere: lessons play in Drive's own player (an iframe
// of /file/d/ID/preview), and the two things the editor needs, "is this file
// shared?" and "what is in this folder?", are read from Drive's public pages,
// the same ones anyone holding the link can open.

const ID = /^[A-Za-z0-9_-]{25,}$/;
const UA = { 'User-Agent': 'Mozilla/5.0 (skeo LMS)' };
const VIDEO_FILE = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|mpe?g)$/i;

/** The file id from a Drive share link or a bare id; '' if it is neither. */
export function parseDriveId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (ID.test(s)) return s;
  let url;
  try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return ''; }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return '';
  if (/\/folders\//.test(url.pathname)) return '';
  const m = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([^/?#]+)/);
  const id = m ? m[1] : url.searchParams.get('id');
  return id && ID.test(id) ? id : '';
}

/** The folder id from a Drive folder link or a bare id; '' if neither. */
export function parseFolderId(input) {
  const s = String(input || '').trim();
  if (ID.test(s)) return s;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{25,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{25,})/);
  return m ? m[1] : '';
}

const unescapeHtml = (s) => s
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// One folder's entries, from the page Drive serves for embedding a shared
// folder. A folder that is not shared answers with no entries.
async function folderEntries(folderId) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, {
    headers: UA,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const out = [];
  const entry = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?flip-entry-title">([^<]*)</g;
  for (let m = entry.exec(html); m; m = entry.exec(html)) {
    out.push({ id: m[1], folder: m[2].includes('/folders/'), name: unescapeHtml(m[3]).trim() });
  }
  return out;
}

/**
 * Every video in a shared folder and the folders inside it (two levels:
 * course folder → module folders → videos). [{ id, name, folder }]
 */
export async function listDriveVideos(folderId, depth = 2, folderName = '') {
  const entries = await folderEntries(folderId);
  const videos = [];
  for (const e of entries) {
    if (e.folder) {
      if (depth > 0) videos.push(...await listDriveVideos(e.id, depth - 1, e.name));
    } else if (VIDEO_FILE.test(e.name)) {
      videos.push({ id: e.id, name: e.name, folder: folderName });
    }
  }
  return videos;
}

/**
 * Can a student open this file? Its public page answers 200 with the file's
 * name in the title when it is shared "Anyone with the link"; anything else
 * (a sign-in redirect, an error) means they cannot.
 * { status: 'ok' | 'private' | 'error', name?, message? }
 */
export async function checkDriveFile(id) {
  let res;
  try {
    res = await fetch(`https://drive.google.com/file/d/${id}/view`, {
      headers: UA,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { status: 'error', message: `Could not reach Google Drive: ${e.message}` };
  }
  if (res.status !== 200) {
    return { status: 'private', message: 'Students cannot open this file. In Drive, set sharing to “Anyone with the link: Viewer”.' };
  }
  const title = (await res.text()).match(/<title>([^<]*)<\/title>/)?.[1] || '';
  const name = unescapeHtml(title.replace(/\s*-\s*Google Drive\s*$/, '')).trim();
  if (name && !VIDEO_FILE.test(name)) {
    return { status: 'not-video', name, message: 'This Drive file does not look like a video.' };
  }
  return { status: 'ok', name };
}

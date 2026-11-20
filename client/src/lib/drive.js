/* Lesson videos kept in Google Drive. They play in Drive's own player, an
 * iframe of /file/d/ID/preview (components/DriveFrame.jsx): no API key, and
 * Drive converts whatever was uploaded. The file must be shared "Anyone with
 * the link: Viewer". */

// Drive ids are long (28 to 44 characters in practice); 25 keeps an 11-letter
// YouTube id or a stray word from passing as one.
const ID = /^[A-Za-z0-9_-]{25,}$/;

/** A Drive file id from whatever an admin pastes: a /file/d/ID/view share
 * link, an open?id= or uc?id= link, a docs.google.com/file link, or the bare
 * id. Null for anything else, a folder link included. */
export function parseDriveId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (ID.test(s)) return s;
  let url;
  try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
  if (/\/folders\//.test(url.pathname)) return null;
  const m = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([^/?#]+)/);
  const id = m ? m[1] : url.searchParams.get('id');
  return id && ID.test(id) ? id : null;
}

/** A Drive folder id from a folder link; null otherwise. */
export function parseFolderId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{25,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{25,})/);
  return m ? m[1] : null;
}

export const driveViewUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
export const drivePreviewUrl = (id) => `https://drive.google.com/file/d/${id}/preview`;
/** Drive's thumbnail of the file: a frame from the video once it is processed. */
export const driveThumb = (id, width = 1280) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;

/* A video file's name as a line the bulk box matches by lesson number:
 * "4.1 Connectors & MCP.mp4" stays "4.1 Connectors & MCP"; a recap file
 * ("1.9 Module 1 Recap.mp4") becomes "Module 1 Recap", the way the
 * curriculum titles its recaps. */
export function lessonLabel(fileName) {
  const name = String(fileName || '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
  const recap = name.match(/module\s*0*(\d+)\s*recap/i);
  return recap ? `Module ${recap[1]} Recap` : name;
}

// Reads what is inside a submitted Drive folder, for the AI grader.
//
// The folder has already passed utils/driveVerify.js, so every file in it is
// link-shared and the same server-side API key can read it. Each file becomes
// Gemini input in the cheapest form that keeps what matters:
//   Google Docs / Slides / Sheets  exported as plain text / CSV
//   .docx / .pptx                  text pulled straight out of the zip
//   .txt / .md / .html / .csv      read as text (HTML stays code: a tool
//                                  built in Claude Code is judged by its code)
//   PDF, images                    attached as-is: Gemini reads PDFs and
//                                  screenshots natively, layout and all
//   video, old binary formats      listed by name only
//
// No PDF parser runs here on purpose. pdf-parse can segfault (see
// docparse.js), and Gemini reads the PDF better than extracted text would.
// The .docx/.pptx reading is a few string scans over XML, not a document
// library, so it is cheap enough to do on the request process.
import { inflateRawSync } from 'node:zlib';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const LIMITS = {
  files: 20, // read at most this many files
  fileBytes: 10 * 1024 * 1024, // skip any single file bigger than this
  inlineBytes: 11 * 1024 * 1024, // PDFs + images attached, in total (Gemini caps a request at 20 MB, base64 adds a third)
  images: 8,
  fileChars: 25_000, // text kept per file
  totalChars: 90_000, // text kept across the folder
};

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'rtf']);
const GOOGLE_EXPORT = {
  'application/vnd.google-apps.document': ['text/plain', 'Google Doc'],
  'application/vnd.google-apps.presentation': ['text/plain', 'Google Slides'],
  'application/vnd.google-apps.spreadsheet': ['text/csv', 'Google Sheet'],
};
const FOLDER = 'application/vnd.google-apps.folder';

const extOf = (name = '') => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

// Old submissions stored only the link; the id is in it.
function driveIdOf(f) {
  if (f.driveId) return f.driveId;
  const link = String(f.webViewLink || '');
  const m = link.match(/\/(?:d|folders)\/([\w-]{10,})/) || link.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}

async function driveFetch(path, apiKey) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${DRIVE_API}${path}${sep}key=${apiKey}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Drive returned HTTP ${res.status}`);
  return res;
}

// Downloads a body, refusing anything over the size cap before reading it.
async function download(path, apiKey, maxBytes = LIMITS.fileBytes) {
  const res = await driveFetch(path, apiKey);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) {
    res.body?.cancel?.();
    throw new Error(`too large (${Math.round(len / 1048576)} MB)`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`too large (${Math.round(buf.length / 1048576)} MB)`);
  return buf;
}

// Fallbacks for when the Drive API refuses a read (some key types and some
// Workspace exports): Google's own public links for "anyone with the link"
// files, which need no key at all. A sign-in page coming back means the file
// is not actually public, so HTML is treated as a failure.
const PUBLIC_EXPORT = {
  'application/vnd.google-apps.document': (id) => [`https://docs.google.com/document/d/${id}/export?format=txt`, 'text'],
  'application/vnd.google-apps.presentation': (id) => [`https://docs.google.com/presentation/d/${id}/export/pptx`, 'pptx'],
  'application/vnd.google-apps.spreadsheet': (id) => [`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`, 'text'],
};

async function publicFetch(url, maxBytes = LIMITS.fileBytes, { allowHtml = false } = {}) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Google returned HTTP ${res.status}`);
  if (!allowHtml && /text\/html/.test(res.headers.get('content-type') || '')) {
    res.body?.cancel?.();
    throw new Error('the file is not shared publicly');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`too large (${Math.round(buf.length / 1048576)} MB)`);
  return buf;
}

// alt=media through the API, else the public download link.
async function downloadFile(id, apiKey, maxBytes = LIMITS.fileBytes, { allowHtml = false } = {}) {
  try {
    return await download(`/files/${id}?alt=media`, apiKey, maxBytes);
  } catch (err) {
    if (/too large/.test(err.message)) throw err;
    return publicFetch(`https://drive.google.com/uc?export=download&id=${id}`, maxBytes, { allowHtml });
  }
}

// ── Minimal zip reader, for .docx and .pptx ────────────────────────────────
// Reads the central directory and inflates only the entries asked for.
function zipEntries(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a valid Office file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count && p + 46 <= buf.length; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (data) out.push({ name, text: data.toString('utf8') });
  }
  return out;
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

// Text runs (<w:t> in Word, <a:t> in PowerPoint), one line per paragraph.
function runsToText(xml, tag) {
  return xml
    .split(new RegExp(`</${tag.split(':')[0]}:p>`))
    .map((para) => [...para.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => decodeXml(m[1])).join(''))
    .filter((line) => line.trim())
    .join('\n');
}

function docxText(buf) {
  const [doc] = zipEntries(buf, (n) => n === 'word/document.xml');
  if (!doc) throw new Error('no document body found');
  return runsToText(doc.text, 'w:t');
}

function pptxText(buf) {
  const slides = zipEntries(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.name.match(/(\d+)\.xml$/)[1]) - Number(b.name.match(/(\d+)\.xml$/)[1]));
  if (!slides.length) throw new Error('no slides found');
  return slides.map((s, i) => `--- Slide ${i + 1} ---\n${runsToText(s.text, 'a:t')}`).join('\n\n');
}

// Inline images in an exported HTML page can run to megabytes of base64 that
// tell the grader nothing; the markup around them is what matters.
const shrinkHtml = (s) => s.replace(/data:[a-z]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]{200,}/g, 'data:…');

// Turns one Drive file into { kind: 'text', text } | { kind: 'inline', mime, data } | { kind: 'skip', why }.
async function readOne(f, apiKey, budget) {
  const id = driveIdOf(f);
  if (!id) return { kind: 'skip', why: 'no file id' };
  const mime = f.mimeType || '';
  const ext = extOf(f.name);

  if (GOOGLE_EXPORT[mime]) {
    const [as] = GOOGLE_EXPORT[mime];
    try {
      const buf = await download(`/files/${id}/export?mimeType=${encodeURIComponent(as)}`, apiKey);
      return { kind: 'text', text: buf.toString('utf8') };
    } catch (err) {
      if (/too large/.test(err.message)) throw err;
      const [url, shape] = PUBLIC_EXPORT[mime](id);
      const buf = await publicFetch(url);
      return { kind: 'text', text: shape === 'pptx' ? pptxText(buf) : buf.toString('utf8') };
    }
  }
  if (mime.startsWith('application/vnd.google-apps.')) return { kind: 'skip', why: 'this Google file type cannot be exported' };

  if (mime === 'application/pdf' || ext === 'pdf') {
    if (budget.inline <= 0) return { kind: 'skip', why: 'too many large attachments in the folder' };
    const buf = await downloadFile(id, apiKey, Math.min(LIMITS.fileBytes, budget.inline));
    budget.inline -= buf.length;
    return { kind: 'inline', mime: 'application/pdf', data: buf.toString('base64') };
  }
  if (IMAGE_TYPES.has(mime)) {
    if (budget.images <= 0) return { kind: 'skip', why: `only the first ${LIMITS.images} images are reviewed` };
    if (budget.inline <= 0) return { kind: 'skip', why: 'too many large attachments in the folder' };
    const buf = await downloadFile(id, apiKey, Math.min(4 * 1024 * 1024, budget.inline));
    budget.inline -= buf.length;
    budget.images -= 1;
    return { kind: 'inline', mime, data: buf.toString('base64') };
  }
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return { kind: 'text', text: docxText(await downloadFile(id, apiKey)) };
  }
  if (ext === 'pptx' || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return { kind: 'text', text: pptxText(await downloadFile(id, apiKey)) };
  }
  if (TEXT_EXT.has(ext) || mime.startsWith('text/')) {
    const isHtml = ext === 'html' || ext === 'htm' || mime === 'text/html';
    const text = (await downloadFile(id, apiKey, LIMITS.fileBytes, { allowHtml: isHtml })).toString('utf8');
    return { kind: 'text', text: isHtml ? shrinkHtml(text) : text };
  }
  if (mime.startsWith('video/')) return { kind: 'skip', why: 'video is not reviewed' };
  if (mime.startsWith('audio/')) return { kind: 'skip', why: 'audio is not reviewed' };
  return { kind: 'skip', why: `.${ext || 'unknown'} files cannot be opened; use PDF, Word, PowerPoint or Google Docs` };
}

// Files a grader should see first: the write-up, then decks and pages, then
// attachments. Within a kind, Drive's own order.
const rank = (f) => {
  const m = f.mimeType || '';
  if (/document|wordprocessing|text\/plain|markdown/.test(m) || /^(docx|txt|md)$/.test(extOf(f.name))) return 0;
  if (/presentation/.test(m) || extOf(f.name) === 'pptx') return 1;
  if (m === 'text/html' || /^html?$/.test(extOf(f.name))) return 2;
  if (m === 'application/pdf') return 3;
  if (m.startsWith('image/')) return 5;
  return 4;
};

// A subfolder (screenshots/, say) is opened one level down.
async function expandFolders(files, apiKey) {
  const out = [];
  for (const f of files) {
    if (f.mimeType !== FOLDER) { out.push(f); continue; }
    try {
      const q = encodeURIComponent(`'${driveIdOf(f)}' in parents and trashed = false`);
      const res = await driveFetch(`/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`, apiKey);
      const { files: inner = [] } = await res.json();
      for (const g of inner) if (g.mimeType !== FOLDER) out.push({ driveId: g.id, name: `${f.name}/${g.name}`, mimeType: g.mimeType });
    } catch {
      out.push({ ...f, unreadable: 'subfolder could not be opened' });
    }
  }
  return out;
}

/**
 * readDriveFiles(files) -> { parts, manifest, readable }
 *   parts:    Gemini content parts, each file wrapped in <student_file> tags
 *   manifest: [{ name, read }] what was read and how, or why not
 *   readable: how many files made it into `parts`
 */
export async function readDriveFiles(files, { apiKey = process.env.GOOGLE_DRIVE_API_KEY } = {}) {
  if (!apiKey) throw new Error('GOOGLE_DRIVE_API_KEY is not set, so the folder cannot be read.');
  const all = (await expandFolders(files || [], apiKey)).sort((a, b) => rank(a) - rank(b));
  const budget = { inline: LIMITS.inlineBytes, images: LIMITS.images, chars: LIMITS.totalChars };
  const parts = [];
  const manifest = [];
  let readable = 0;

  for (const [i, f] of all.entries()) {
    if (i >= LIMITS.files) { manifest.push({ name: f.name, read: 'not opened: more than 20 files in the folder' }); continue; }
    if (f.unreadable) { manifest.push({ name: f.name, read: `unreadable: ${f.unreadable}` }); continue; }
    let got;
    try { got = await readOne(f, apiKey, budget); } catch (err) { got = { kind: 'skip', why: err.message }; }

    if (got.kind === 'text') {
      const clean = got.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!clean) { manifest.push({ name: f.name, read: 'opened, but it is empty' }); continue; }
      const room = Math.min(LIMITS.fileChars, budget.chars);
      if (room <= 0) { manifest.push({ name: f.name, read: 'not opened: the folder has too much text' }); continue; }
      const cut = clean.length > room;
      const text = cut ? `${clean.slice(0, room)}\n[… cut here, ${clean.length - room} more characters]` : clean;
      budget.chars -= Math.min(clean.length, room);
      parts.push({ text: `<student_file name="${f.name.replace(/"/g, "'")}">\n${text}\n</student_file>` });
      manifest.push({ name: f.name, read: cut ? 'read as text (long, so only the start)' : 'read as text' });
      readable += 1;
    } else if (got.kind === 'inline') {
      parts.push({ text: `<student_file name="${f.name.replace(/"/g, "'")}"> (attached below)` });
      parts.push({ inline_data: { mime_type: got.mime, data: got.data } });
      parts.push({ text: '</student_file>' });
      manifest.push({ name: f.name, read: got.mime === 'application/pdf' ? 'attached (PDF)' : 'attached (image)' });
      readable += 1;
    } else {
      manifest.push({ name: f.name, read: `unreadable: ${got.why}` });
    }
  }
  return { parts, manifest, readable };
}

// Exposed for the local check script; not used by the app.
export const _internals = { docxText, pptxText, driveIdOf };

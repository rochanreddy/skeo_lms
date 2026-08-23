import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

// Turn an uploaded curriculum doc (.docx / .pdf / .md / .txt) into the LMS
// Program → Module → Chapter → Topic tree. The pipeline is two stages:
//   1) extract the doc into a flat list of "blocks" { level, text }
//      where level 1/2/3 = heading depth and level 0 = body paragraph.
//   2) fold those blocks into modules/chapters/topics.

const decode = (s) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// ── Extractors → block list ─────────────────────────────────────────────

// Word docs carry real heading styles; mammoth surfaces them as <h1>..<h6>.
async function blocksFromDocx(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const blocks = [];
  const re = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const text = decode(m[2]);
    if (!text) continue;
    if (tag[0] === 'h') blocks.push({ level: Math.min(3, Number(tag[1])), text });
    else if (tag === 'li') blocks.push({ level: 0, text: `- ${text}` });
    else blocks.push({ level: 0, text });
  }
  return blocks;
}

// Markdown / plain text: '#'/'##'/'###' are headings; blank lines split paras.
function blocksFromText(text) {
  const blocks = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { blocks.push({ level: 0, text: '' }); continue; } // paragraph break marker
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ level: Math.min(3, h[1].length), text: h[2].trim() }); continue; }
    blocks.push({ level: 0, text: line.trim() });
  }
  return coalesceBodies(blocks);
}

// PDFs are plain text with no markup, so infer headings heuristically:
// numbered sections, "Session/Module/Unit N", and short Title-Case lines.
function blocksFromPdf(text) {
  const clean = text
    .split(/\r?\n/)
    .filter((l) => !/^--\s*\d+\s*of\s*\d+\s*--$/i.test(l.trim())) // page markers
    .join('\n');
  const blocks = [];
  for (const raw of clean.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { blocks.push({ level: 0, text: '' }); continue; }
    const lvl = headingLevel(line);
    blocks.push(lvl ? { level: lvl, text: line.replace(/^#+\s*/, '') } : { level: 0, text: line });
  }
  return coalesceBodies(blocks);
}

function headingLevel(line) {
  if (/^#{1,6}\s/.test(line)) return Math.min(3, line.match(/^#+/)[0].length);
  if (/^(session|module|unit|week)\s+\d+/i.test(line)) return 1;
  if (/^chapter\s+/i.test(line)) return 2;
  if (/^\d+\.\d+[.)]?\s+\S/.test(line)) return 2;      // "1.1 Foo"
  if (/^\d+[.)]\s+\S/.test(line) && line.length < 80) return 1; // "1. Foo"
  // short, no trailing punctuation, looks like a title
  if (line.length <= 64 && !/[.!?,:;]$/.test(line) && /[A-Za-z]/.test(line) && line.split(' ').length <= 10) {
    const caps = line === line.toUpperCase();
    if (caps) return 2;
  }
  return 0;
}

// Merge consecutive body lines into single paragraphs (blank line = separator).
function coalesceBodies(blocks) {
  const out = [];
  let buf = [];
  const flush = () => { if (buf.length) { out.push({ level: 0, text: buf.join('\n') }); buf = []; } };
  for (const b of blocks) {
    if (b.level > 0) { flush(); out.push(b); continue; }
    if (b.text === '') { flush(); continue; }
    // keep list items on their own lines; otherwise join wrapped lines
    buf.push(b.text);
  }
  flush();
  return out;
}

// ── Fold blocks → modules/chapters/topics ───────────────────────────────

function blocksToModules(blocks, fallbackTitle) {
  const headingLevels = [...new Set(blocks.filter((b) => b.level > 0).map((b) => b.level))].sort();
  // Map the distinct heading depths present onto module/chapter/topic roles.
  // 3+ levels → module/chapter/topic; 2 → module/topic; 1 → topic (flat list).
  let roleOf;
  if (headingLevels.length >= 3) {
    const [a, b, c] = headingLevels;
    roleOf = (lvl) => (lvl <= a ? 'module' : lvl <= b ? 'chapter' : 'topic');
  } else if (headingLevels.length === 2) {
    const [a] = headingLevels;
    roleOf = (lvl) => (lvl <= a ? 'module' : 'topic');
  } else {
    roleOf = () => 'topic';
  }

  const modules = [];
  let mod = null, chap = null, top = null;

  const newModule = (title) => { mod = { title, order: modules.length, chapters: [] }; modules.push(mod); chap = null; top = null; };
  const newChapter = (title) => { if (!mod) newModule(fallbackTitle); chap = { title, order: mod.chapters.length, topics: [] }; mod.chapters.push(chap); top = null; };
  const newTopic = (title) => { if (!chap) newChapter('Lessons'); top = { title, contentType: 'text', contentUrl: '', body: '', order: chap.topics.length }; chap.topics.push(top); };

  for (const b of blocks) {
    if (b.level === 0) {
      if (!top) newTopic('Overview');
      top.body = top.body ? `${top.body}\n\n${b.text}` : b.text;
      continue;
    }
    const role = roleOf(b.level);
    if (role === 'module') newModule(b.text);
    else if (role === 'chapter') newChapter(b.text);
    else newTopic(b.text);
  }

  // Drop empties; ensure every module/chapter has content.
  return modules
    .map((m) => ({ ...m, chapters: m.chapters.filter((c) => c.topics.length) }))
    .filter((m) => m.chapters.length);
}

// ── Public API ──────────────────────────────────────────────────────────

/** Extract + structure an uploaded doc into a modules tree. */
export async function parseDocToModules(buffer, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const fallback = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported content';

  let blocks;
  if (ext === 'docx') blocks = await blocksFromDocx(buffer);
  else if (ext === 'pdf') {
    const { text } = await new PDFParse({ data: new Uint8Array(buffer) }).getText();
    blocks = blocksFromPdf(text || '');
  } else {
    blocks = blocksFromText(buffer.toString('utf8'));
  }

  const modules = blocksToModules(blocks, fallback);
  const topics = modules.reduce((n, m) => n + m.chapters.reduce((k, c) => k + c.topics.length, 0), 0);
  return { modules, stats: { modules: modules.length, topics } };
}

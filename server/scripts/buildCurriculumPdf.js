// Render the Claude curriculum PDF that every lesson opens in the reader.
//
// Built from claudeCurriculum.js — the same source seedClaude.js writes into
// the LMS — so edit the course there and re-run this, never the PDF by hand.
// Prints through a local Chrome or Edge in headless mode; set CHROME_PATH if
// neither is found where it usually lives.
//   node scripts/buildCurriculumPdf.js
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { MODULES } from './claudeCurriculum.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientPublic = path.resolve(here, '../../client/public');
const OUT = path.join(clientPublic, 'pdfs', 'skeo_Claude_Curriculum.pdf');

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = (file) => pathToFileURL(path.join(clientPublic, 'fonts', file)).href;

function render() {
  const lessons = MODULES.reduce((n, m) => n + m.lessons.length, 0);
  const modules = MODULES.map((m, mi) => {
    const [code, name] = m.title.split(' · ');
    const items = m.lessons.map((l) => `
      <section class="lesson">
        <h3><span class="code">${esc(l.code)}</span>${esc(l.title)}</h3>
        <ul>${l.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        ${l.assignment ? `<p class="task"><strong>Assignment</strong>${esc(l.assignment)}</p>` : ''}
      </section>`).join('');
    return `
      <article class="module">
        <p class="kicker">Week ${mi + 1} · ${esc(code)}</p>
        <h2>${esc(name)}</h2>
        ${items}
      </article>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>skeo — Claude Curriculum</title>
<style>
  @font-face { font-family: 'Inter'; font-weight: 100 900; src: url('${font('inter-normal-latin.woff2')}') format('woff2'); }
  @font-face { font-family: 'DM Sans'; font-weight: 500 900; src: url('${font('dm-sans-normal-latin.woff2')}') format('woff2'); }
  @page { size: A4; margin: 18mm 17mm 20mm; }
  :root { --ink: #191817; --muted: #625c53; --line: #e3e0d6; --accent: #bd5a38; --accent-ink: #96421f; --soft: #f7eae3; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.5 'Inter', system-ui, sans-serif; color: var(--ink); }
  h1, h2, h3 { font-family: 'DM Sans', 'Inter', sans-serif; letter-spacing: -0.02em; margin: 0; }
  .cover { padding: 8mm 0 10mm; border-bottom: 2px solid var(--accent); margin-bottom: 8mm; }
  .brand { font: 700 13pt 'DM Sans', sans-serif; color: var(--accent); margin: 0 0 14mm; }
  .cover h1 { font-size: 30pt; line-height: 1.05; }
  .cover .sub { color: var(--muted); font-size: 12pt; margin: 4mm 0 0; }
  .cover .facts { display: flex; gap: 8mm; margin-top: 8mm; font-size: 10pt; color: var(--muted); }
  .cover .facts b { display: block; font: 700 18pt 'DM Sans', sans-serif; color: var(--ink); }
  .toc { margin: 0 0 4mm; padding: 0; list-style: none; columns: 2; column-gap: 8mm; }
  .toc li { break-inside: avoid; padding: 1.6mm 0; border-bottom: 1px solid var(--line); font-size: 10pt; }
  .toc .wk { color: var(--accent-ink); font-weight: 600; margin-right: 2mm; }
  .module { break-before: page; }
  .kicker { margin: 0 0 1mm; color: var(--accent-ink); font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; }
  .module h2 { font-size: 19pt; line-height: 1.15; padding-bottom: 3mm; border-bottom: 1px solid var(--line); margin-bottom: 4mm; }
  .lesson { break-inside: avoid; margin: 0 0 5mm; }
  .lesson h3 { font-size: 12pt; margin-bottom: 1.5mm; }
  .code { color: var(--accent); margin-right: 2.5mm; font-variant-numeric: tabular-nums; }
  ul { margin: 0; padding-left: 5mm; }
  li { margin: 0.8mm 0; }
  li::marker { color: var(--accent); }
  .task { margin: 2mm 0 0; padding: 2.2mm 3mm; background: var(--soft); border-left: 3px solid var(--accent); border-radius: 0 4px 4px 0; }
  .task strong { display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-ink); margin-bottom: 0.5mm; }
</style></head>
<body>
  <header class="cover">
    <p class="brand">skeo</p>
    <h1>Claude — the full curriculum</h1>
    <p class="sub">How AI and Claude actually work, how to work with Claude well, and how to ship real work with it.</p>
    <div class="facts">
      <span><b>8</b>weeks</span>
      <span><b>${MODULES.length}</b>modules</span>
      <span><b>${lessons}</b>lessons</span>
      <span><b>1</b>capstone</span>
    </div>
  </header>
  <ol class="toc">${MODULES.map((m, i) => `<li><span class="wk">Week ${i + 1}</span>${esc(m.title.split(' · ')[1])}</li>`).join('')}</ol>
  ${modules}
</body></html>`;
}

const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) {
  console.error('No Chrome or Edge found. Set CHROME_PATH to one and re-run.');
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skeo-curriculum-'));
const html = path.join(tmp, 'curriculum.html');
fs.writeFileSync(html, render());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
  '--no-pdf-header-footer', `--print-to-pdf=${OUT}`, pathToFileURL(html).href,
], { stdio: 'ignore' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);

// A small, safe Markdown renderer — no deps, no dangerouslySetInnerHTML.
// Supports: #/##/### headings, **bold**, *italic*, `code`, ```code blocks```,
// [links](url), - / * / 1. lists, > quotes, --- rules, and paragraphs.
import { useMemo } from 'react';

// Keys are positional, never a counter. A module-level seed used to hand every
// render a fresh set of keys, so React could match nothing against the previous
// tree and tore down the whole rendered document on each parent state change —
// taking the reader's text selection with it. Position is stable across renders
// of the same text, which is exactly what reconciliation wants.

// Inline: split a line into React nodes for bold/italic/code/links.
function inline(text) {
  const nodes = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `i${n++}`;
    if (m[2] != null) nodes.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<em key={key}>{m[3]}</em>);
    else if (m[4] != null) nodes.push(<code key={key}>{m[4]}</code>);
    else if (m[5] != null) nodes.push(<a key={key} href={/^https?:\/\//.test(m[6]) ? m[6] : '#'} target="_blank" rel="noreferrer">{m[5]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function render(text) {
  // Normalise "•" bullets (common in pasted/seeded/PDF content) into real
  // markdown list items so they render point-wise instead of as a paragraph.
  const lines = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*•[ \t]*/g, '\n- ')
    .split('\n');
  const out = [];
  let i = 0;
  // Block index doubles as the key — the nth block of a given text is always
  // the nth block, so nothing moves under React between renders.
  const k = () => `b${out.length}`;

  while (i < lines.length) {
    let line = lines[i];

    if (!line.trim()) { i++; continue; }

    // fenced code block
    if (line.trim().startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++; // closing fence
      out.push(<pre key={k()} className="md-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    // horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) { out.push(<hr key={k()} className="md-hr" />); i++; continue; }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(4, h[1].length);
      const Tag = `h${lvl}`;
      out.push(<Tag key={k()} className="md-h">{inline(h[2])}</Tag>);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(<blockquote key={k()} className="md-quote">{inline(buf.join(' '))}</blockquote>);
      continue;
    }

    // ordered / unordered list
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(<List key={k()} className="md-list">{items.map((it, li) => <li key={li}>{inline(it)}</li>)}</List>);
      continue;
    }

    // paragraph (gather until blank line)
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>\s?|\s*([-*+]|\d+[.)])\s|```)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={k()} className="md-p">{inline(para.join(' '))}</p>);
  }

  return <div className="md">{out}</div>;
}

// Parsing is pure in `text`, so a parent re-render that didn't change the text
// shouldn't re-run the tokeniser or rebuild the tree.
export default function Markdown({ text = '' }) {
  return useMemo(() => render(text), [text]);
}

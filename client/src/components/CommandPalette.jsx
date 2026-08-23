import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';

// ⌘K — navigation AND search.
//
// It used to list nav destinations only, which meant finding one lesson still
// took three clicks through the curriculum tree. Now the same box queries
// /search: lessons (by title AND by body text), assignments, sessions, library
// resources and — for staff — people. Enter lands you *inside* the lesson, not
// on the page that contains it.
//
// Empty query still shows the destinations, so the old muscle memory is intact.

// Result kinds map onto the existing icon set + a human label for the group.
const KIND = {
  lesson: { icon: 'learning', group: 'Lessons' },
  program: { icon: 'programs', group: 'Programmes' },
  assignment: { icon: 'grades', group: 'Assignments' },
  project: { icon: 'grades', group: 'Assignments' },
  session: { icon: 'webinar', group: 'Sessions' },
  library: { icon: 'library', group: 'Library' },
  student: { icon: 'profile', group: 'People' },
};

// Bold the matched run so the eye lands on why the row is here.
function Highlight({ text, q }) {
  const needle = (q || '').trim();
  if (!needle) return text;
  const i = String(text).toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="cmd-mark">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

export default function CommandPalette({ open, onClose, tabs, onLogout }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [remote, setRemote] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Destinations — always available, and the whole list when the box is empty.
  const navItems = useMemo(() => {
    const go = tabs.map((t) => ({
      id: `go:${t.path}`,
      label: t.label,
      group: 'Go to',
      icon: t.label,
      run: () => navigate(t.path ? `/app/${t.path}` : '/app'),
    }));
    return [...go, { id: 'logout', label: 'Log out', group: 'Account', icon: 'logout', run: onLogout }];
  }, [tabs, navigate, onLogout]);

  // Debounced remote search. The request is tagged so a slow early response can
  // never overwrite the results of a later keystroke.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setRemote([]); setBusy(false); return undefined; }
    let alive = true;
    setBusy(true);
    const id = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(needle)}`)
        .then((d) => { if (alive) setRemote(d.results || []); })
        .catch(() => { if (alive) setRemote([]); })
        .finally(() => { if (alive) setBusy(false); });
    }, 170);
    return () => { alive = false; clearTimeout(id); };
  }, [q]);

  // Subsequence match on destinations, so "lb" still finds "Library".
  const localHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return navItems;
    return navItems.filter((it) => {
      const hay = it.label.toLowerCase();
      if (hay.includes(needle)) return true;
      let i = 0;
      for (const ch of hay) if (ch === needle[i]) i += 1;
      return i === needle.length;
    });
  }, [q, navItems]);

  const results = useMemo(() => {
    const content = remote.map((r) => ({
      id: `${r.type}:${r.id}`,
      label: r.title,
      sub: r.subtitle,
      detail: r.detail,
      group: KIND[r.type]?.group || 'Results',
      icon: KIND[r.type]?.icon || 'home',
      run: () => navigate(r.to),
    }));
    // Content leads once you're actually searching — destinations are a short
    // known list you can also just reach from the dock.
    return q.trim().length >= 2 ? [...content, ...localHits] : localHits;
  }, [remote, localHits, q, navigate]);

  useEffect(() => { setSel(0); }, [q, remote]);
  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setSel(0);
    setRemote([]);
    // Focus after paint so the sheet animation doesn't fight the caret.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('.cmd-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel, results]);

  if (!open) return null;

  function onKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[sel];
      if (item) { item.run(); onClose(); }
    }
  }

  const searching = q.trim().length >= 2;
  let lastGroup = null;

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="cmd-input-wrap">
          {busy ? (
            <span className="cmd-spin" aria-hidden="true" />
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
          )}
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search lessons, assignments, people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {q && <button className="cmd-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear">✕</button>}
        </div>

        <div className="cmd-list" ref={listRef}>
          {results.length === 0 && (
            <div className="cmd-empty">
              {busy ? 'Searching…' : <>Nothing matches “{q}”.<div className="cmd-empty-sub">Try a lesson name, a topic, or a person.</div></>}
            </div>
          )}
          {results.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head && <div className="cmd-group">{head}</div>}
                <button
                  className={`cmd-item ${i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => { it.run(); onClose(); }}
                >
                  <Icon name={it.icon} />
                  <span className="cmd-text">
                    <span className="cmd-label"><Highlight text={it.label} q={searching ? q : ''} /></span>
                    {it.sub && <span className="cmd-sub-line">{it.sub}</span>}
                    {it.detail && <span className="cmd-detail"><Highlight text={it.detail} q={q} /></span>}
                  </span>
                  {i === sel && <span className="cmd-enter">↵</span>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="cmd-foot">
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
          {searching && <span className="cmd-foot-count">{remote.length} result{remote.length === 1 ? '' : 's'}</span>}
        </div>
      </div>
    </div>
  );
}

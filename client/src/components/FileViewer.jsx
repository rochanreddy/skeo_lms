import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.jsx';
// `?url` emits the worker as its own asset and hands us a string — the 1.3 MB
// never enters the bundle, and is only fetched when a PDF is actually opened.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// A panel over the page — never a navigation, so closing it returns you to the
// exact scroll position you left. PDFs render through the custom reader below
// (paged, zoomable, searchable); Office formats go through Microsoft's embed.
//
// `allowNewTab` exists because the same reader can serve opposite purposes.
// For course material the whole point is to withhold the browser's native
// viewer, download and print included — so it stays off by default; callers
// with nothing to protect can opt in.
function FileViewer({ label, subtitle, url, onClose, allowNewTab = false }) {
  const ext = (url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
  const isOffice = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'].includes(ext);
  const isPdf = ext === 'pdf';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1)/i.test(url);
  const src = isOffice ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : url;

  // Radix portals this to <body>, which matters here: `.main` carries the
  // page-enter animation, and a filling transform/opacity animation makes that
  // element a stacking context — an in-place overlay would be trapped inside
  // it, letting the topbar and the dock paint over the reader at any z-index.
  // Escape, the focus trap and returning focus to the opener are Radix's too;
  // the hand-rolled versions below it only moved focus, they never trapped it,
  // so Tab used to walk straight out of the reader and into the page behind.
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="fv-overlay"
        className="fv z-[131] gap-0 border-0 p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{`${label} — ${subtitle}`}</DialogTitle>
        <div className="fv-head">
          <div className="fv-head-copy">
            <div className="fv-kicker">{label}</div>
            <div className="fv-title">{subtitle}</div>
          </div>
          {/* Off for course PDFs (see the note on allowNewTab). Office files
              always keep it — their embed can fail and there's no other way in. */}
          {(!isPdf || allowNewTab) && <a className="fv-escape" href={url} target="_blank" rel="noreferrer">Open in new tab</a>}
          <button className="fv-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {isPdf
          ? <PdfReader url={url} />
          : <iframe className="fv-frame" src={src} title={`${label} — ${subtitle}`} />}
        {isOffice && isLocal && (
          <div className="fv-note">
            This deck is on a local address, which Microsoft's viewer can't reach — put it on a
            public URL to preview it here, or use “Open in new tab”.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Wrap every occurrence of `q` inside an already-rendered text layer in a
// <mark>. Works per text node, so a match split across two pdf.js spans (rare,
// but it happens mid-word) won't light up — the search index below still counts
// it, so navigation stays correct even when the highlight misses.
function highlightMatches(container, q) {
  const needle = q.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeValue && n.nodeValue.toLowerCase().includes(needle)) targets.push(n);
  }
  for (const node of targets) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    for (;;) {
      const at = lower.indexOf(needle, i);
      if (at === -1) break;
      if (at > i) frag.append(text.slice(i, at));
      const mark = document.createElement('mark');
      mark.className = 'pdfr-hit';
      mark.textContent = text.slice(at, at + q.length);
      frag.append(mark);
      i = at + q.length;
    }
    frag.append(text.slice(i));
    node.parentNode?.replaceChild(frag, node);
  }
}

// One page of the document. Mounted for every page in the PDF so the scrollbar
// tells the truth about length, but only PAINTED when it comes near the
// viewport — a 200-page deck would otherwise hold 200 canvases of bitmap.
// Leaving the neighbourhood frees the canvas again.
function PdfPage({ doc, lib, num, zoom, term, base, root, onCurrent, bind }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const linkRef = useRef(null);
  const taskRef = useRef(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState(null); // true page size at scale 1, once known

  // Hand the element up so the toolbar can scroll to this page.
  useEffect(() => { bind(num, hostRef.current); return () => bind(num, null); }, [num, bind]);

  // Paint when close to the viewport; a generous margin means pages are ready
  // before you reach them rather than flashing in under your eyes.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root, rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // Whichever page is crossing the middle of the viewport is "the page you're
  // on" — that's what the toolbar counter reports.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) onCurrent(num); },
      { root, rootMargin: '-45% 0px -45% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root, num, onCurrent]);

  useEffect(() => {
    if (!near) {
      // Hand the bitmap back. Sizing lives in React state, so the placeholder
      // keeps its height and the scrollbar doesn't jump.
      const c = canvasRef.current;
      if (c) { c.width = 0; c.height = 0; }
      textRef.current?.replaceChildren();
      linkRef.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
      const p = await doc.getPage(num);
      if (cancelled || !canvasRef.current) return;

      // Two viewports: CSS scale for the DOM layers, times device pixel ratio
      // for the canvas — otherwise glyphs are soft on retina screens.
      const viewport = p.getViewport({ scale: zoom });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvasVp = p.getViewport({ scale: zoom * dpr });

      const unit = p.getViewport({ scale: 1 });
      if (!size || size.w !== unit.width) setSize({ w: unit.width, h: unit.height });

      const host = hostRef.current;
      // pdf.js's text-layer CSS sizes every span off these two properties.
      host.style.setProperty('--scale-factor', String(zoom));
      host.style.setProperty('--total-scale-factor', String(zoom));

      const canvas = canvasRef.current;
      taskRef.current?.cancel();
      canvas.width = Math.floor(canvasVp.width);
      canvas.height = Math.floor(canvasVp.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = p.render({ canvasContext: canvas.getContext('2d'), viewport: canvasVp });
      taskRef.current = task;
      try { await task.promise; } catch { return; } // superseded by a newer render
      if (cancelled || !textRef.current) return;

      textRef.current.replaceChildren();
      const layer = new lib.TextLayer({ textContentSource: p.streamTextContent(), container: textRef.current, viewport });
      await layer.render();
      if (cancelled) return;
      if (term.length >= 2) highlightMatches(textRef.current, term);

      // Links are our own positioned overlays rather than pdf.js's
      // AnnotationLayer, which would drag in the whole viewer stack just to
      // resolve a destination.
      const annots = await p.getAnnotations({ intent: 'display' });
      if (cancelled || !linkRef.current) return;
      const box = linkRef.current;
      box.replaceChildren();
      for (const a of annots) {
        if (a.subtype !== 'Link' || (!a.url && !a.dest)) continue;
        const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
        const el = document.createElement(a.url ? 'a' : 'button');
        el.className = 'pdfr-link';
        el.style.left = `${Math.min(x1, x2)}px`;
        el.style.top = `${Math.min(y1, y2)}px`;
        el.style.width = `${Math.abs(x2 - x1)}px`;
        el.style.height = `${Math.abs(y2 - y1)}px`;
        if (a.url) {
          el.href = a.url;
          el.target = '_blank';
          el.rel = 'noreferrer noopener';
          el.title = a.url;
        } else {
          el.type = 'button';
          el.title = 'Go to section';
          el.addEventListener('click', async () => {
            try {
              const d = typeof a.dest === 'string' ? await doc.getDestination(a.dest) : a.dest;
              if (d) window.dispatchEvent(new CustomEvent('pdfr:goto', { detail: (await doc.getPageIndex(d[0])) + 1 }));
            } catch { /* broken internal link — stay put */ }
          });
        }
        box.append(el);
      }
      } catch {
        // The document was closed (or destroyed) while this page was still
        // painting. Nothing to recover — just don't let the rejection escape.
      }
    })();
    return () => {
      cancelled = true;
      try { taskRef.current?.cancel(); } catch { /* already finished */ }
    };
  }, [near, zoom, term, num, doc, lib]);

  const dims = size || base;
  return (
    <div
      ref={hostRef}
      className="pdfr-page"
      data-page={num}
      style={{ width: Math.floor(dims.w * zoom), height: Math.floor(dims.h * zoom) }}
    >
      <canvas ref={canvasRef} className="pdfr-canvas" />
      <div ref={textRef} className="textLayer" />
      <div ref={linkRef} className="pdfr-linklayer" />
      <span className="pdfr-folio">{num}</span>
    </div>
  );
}

// A PDF reader we own, rather than the browser's. pdf.js hands us pages; we
// paint them to canvases, lay pdf.js's real text layer over the top, and draw
// our own chrome around the whole thing. Owning the chrome is the point: no
// download, no print, no Save As.
//
// Pages scroll continuously, the way a document wants to be read — the toolbar
// counter follows the scroll rather than driving it.
//
// The text layer is transparent DOM text positioned exactly over the painted
// glyphs. That is what makes selection, copy, find and links work at all — the
// canvas alone is just pixels.
//
// The library is imported lazily, so a student who never opens a document never
// pays for it.
function PdfReader({ url }) {
  const stageRef = useRef(null);
  const libRef = useRef(null);
  const docRef = useRef(null);
  const els = useRef(new Map());
  const textCache = useRef(new Map());
  const currentRef = useRef(1);

  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState(0);
  const [base, setBase] = useState({ w: 612, h: 792 }); // US Letter, until page 1 says otherwise
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [pageBox, setPageBox] = useState('1');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');   // debounced — drives search AND repaint
  const [hits, setHits] = useState([]);   // page number per match, in reading order
  const [hitIdx, setHitIdx] = useState(0);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry a failed load

  // Open the document once per URL.
  useEffect(() => {
    let dead = false;
    setError(''); setReady(false); setPages(0); setCurrent(1); setPageBox('1');
    setQuery(''); setTerm(''); setHits([]);
    textCache.current = new Map();
    els.current = new Map();
    (async () => {
      try {
        const lib = await import('pdfjs-dist/build/pdf.min.mjs');
        lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const doc = await lib.getDocument({ url, isEvalSupported: false }).promise;
        if (dead) { doc.destroy(); return; }
        const first = await doc.getPage(1);
        const unit = first.getViewport({ scale: 1 });
        if (dead) { doc.destroy(); return; }
        libRef.current = lib;
        docRef.current = doc;
        setBase({ w: unit.width, h: unit.height });
        setPages(doc.numPages);
        // Open at the width of the panel — the default a reader expects,
        // rather than an arbitrary percentage.
        const room = (stageRef.current?.clientWidth || unit.width) - 56;
        setZoom(Math.min(2, Math.max(0.5, +(room / unit.width).toFixed(2))));
        setReady(true);
      } catch {
        // Usually a missing CORS header: unlike an iframe, pdf.js fetches the
        // bytes itself and is bound by same-origin rules.
        if (!dead) setError("This document couldn't be loaded. It may have moved, or its host may not allow it to be read here.");
      }
    })();
    // Closing the panel unmounts this. destroy() can throw or reject while a
    // page is mid-render, and an exception escaping a cleanup takes the whole
    // React tree down with it — which showed up as a blank screen on ✕.
    return () => {
      dead = true;
      const d = docRef.current;
      docRef.current = null;
      libRef.current = null;
      try { Promise.resolve(d?.destroy()).catch(() => {}); } catch { /* already gone */ }
    };
  }, [url, reloadKey]);

  const bind = useMemo(() => (n, el) => { if (el) els.current.set(n, el); else els.current.delete(n); }, []);
  const scrollToPage = useMemo(() => (n, smooth = true) => {
    const el = els.current.get(Math.min(Math.max(n, 1), pages || 1));
    el?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }, [pages]);

  const onCurrent = useMemo(() => (n) => {
    currentRef.current = n;
    setCurrent(n);
    setPageBox(String(n));
  }, []);

  // Internal links live in plain DOM listeners inside PdfPage, so they shout
  // rather than call up through props.
  useEffect(() => {
    const go = (e) => scrollToPage(e.detail);
    window.addEventListener('pdfr:goto', go);
    return () => window.removeEventListener('pdfr:goto', go);
  }, [scrollToPage]);

  // Zooming should leave you looking at the same page, not fling you to the top.
  useEffect(() => {
    if (ready) scrollToPage(currentRef.current, false);
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce typing so we neither repaint nor re-scan on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Build the match index across the whole document. Per-page text is cached,
  // so a second search in a long PDF costs nothing extra.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !pages || term.length < 2) { setHits([]); setHitIdx(0); return; }
    let dead = false;
    (async () => {
      try {
      const found = [];
      const needle = term.toLowerCase();
      for (let n = 1; n <= pages; n++) {
        if (dead) return;
        let text = textCache.current.get(n);
        if (text == null) {
          const p = await doc.getPage(n);
          const tc = await p.getTextContent();
          text = tc.items.map((it) => it.str).join(' ');
          textCache.current.set(n, text);
        }
        const hay = text.toLowerCase();
        let at = hay.indexOf(needle);
        while (at !== -1) { found.push(n); at = hay.indexOf(needle, at + needle.length); }
      }
      if (dead) return;
      setHits(found);
      setHitIdx(0);
      if (found.length) scrollToPage(found[0]);
      } catch { /* document closed mid-scan */ }
    })();
    return () => { dead = true; };
  }, [term, pages, scrollToPage]);

  const jumpHit = (n) => {
    if (!hits.length) return;
    const i = (hitIdx + n + hits.length) % hits.length;
    setHitIdx(i);
    scrollToPage(hits[i]);
  };
  const fitWidth = () => {
    const room = (stageRef.current?.clientWidth || base.w) - 56;
    setZoom(Math.min(3, Math.max(0.5, +(room / base.w).toFixed(2))));
  };
  const commitPageBox = () => {
    const n = parseInt(pageBox, 10);
    if (Number.isFinite(n)) scrollToPage(n);
    else setPageBox(String(current));
  };

  // Up/Down scroll the stage natively. Left/Right jump a whole page, which
  // vertical scrolling can't express — unless you're typing in the find box.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollToPage(currentRef.current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToPage(currentRef.current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollToPage]);

  if (error) {
    return (
      <div className="pdfr-state">
        <p>{error}</p>
        <button className="btn sm ghost" onClick={() => setReloadKey((k) => k + 1)} style={{ marginTop: 14 }}>Try again</button>
      </div>
    );
  }

  return (
    <>
      <div className="pdfr-bar">
        <div className="pdfr-group">
          <input
            className="pdfr-pagebox"
            value={pageBox}
            onChange={(e) => setPageBox(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            onBlur={commitPageBox}
            aria-label="Page number"
            disabled={!ready}
          />
          <span className="pdfr-count">of {pages || '–'}</span>
        </div>

        <div className="pdfr-group pdfr-find">
          <input
            className="pdfr-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jumpHit(e.shiftKey ? -1 : 1); } }}
            placeholder="Find in document…"
            aria-label="Find in document"
            disabled={!ready}
          />
          {term.length >= 2 && (
            <>
              <span className="pdfr-count">{hits.length ? `${hitIdx + 1} / ${hits.length}` : 'None'}</span>
              <button className="pdfr-btn" onClick={() => jumpHit(-1)} disabled={!hits.length} aria-label="Previous match">‹</button>
              <button className="pdfr-btn" onClick={() => jumpHit(1)} disabled={!hits.length} aria-label="Next match">›</button>
            </>
          )}
        </div>

        <div className="pdfr-group">
          <button className="pdfr-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} disabled={!ready || zoom <= 0.5} aria-label="Zoom out">−</button>
          <span className="pdfr-count pdfr-zoom">{Math.round(zoom * 100)}%</span>
          <button className="pdfr-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))} disabled={!ready || zoom >= 3} aria-label="Zoom in">+</button>
          <button className="pdfr-btn pdfr-fit" onClick={fitWidth} disabled={!ready} title="Fit width" aria-label="Fit width">⤢</button>
        </div>
      </div>

      <div className="pdfr-stage" ref={stageRef} tabIndex={0}>
        {!ready ? (
          <div className="pdfr-state">Loading document…</div>
        ) : (
          Array.from({ length: pages }, (_, i) => (
            <PdfPage
              key={i + 1}
              num={i + 1}
              doc={docRef.current}
              lib={libRef.current}
              zoom={zoom}
              term={term}
              base={base}
              root={stageRef.current}
              onCurrent={onCurrent}
              bind={bind}
            />
          ))
        )}
      </div>
    </>
  );
}

export default FileViewer;

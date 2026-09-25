// The product name, set plainly. No rule, no dot, no borrowed lockup -- just
// the word in the display face, so it reads as this product's own name.
// theme: 'light' (on the page) | 'dark' (on the stage). On the page the word is
// the palette's ink — near-black by day, near-white by night; on the stage,
// which is dark in both palettes, it is always white. The tagline is the
// accent, in the shade that reads on each ground.
export default function SkeoWordmark({ size = 24, theme = 'light', tagline = '' }) {
  const word = theme === 'dark' ? '#f2f3f5' : 'var(--ink)';
  return (
    <span className="skeo-wm" style={{ fontSize: size, color: word }}>
      <span className="skeo-wm__word">skeo</span>
      {tagline && <span className="skeo-wm__tagline" style={{ color: theme === 'dark' ? 'var(--stage-accent-ink)' : 'var(--blue)' }}>{tagline}</span>}
    </span>
  );
}

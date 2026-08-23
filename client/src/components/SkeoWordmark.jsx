// The product name, set plainly. No rule, no dot, no borrowed lockup -- just
// the word in the display face, so it reads as this product's own name.
// theme: 'light' (ink on light bg) | 'dark' (parchment on dark bg).
export default function SkeoWordmark({ size = 24, theme = 'light', tagline = '' }) {
  const word = theme === 'dark' ? '#f3f1f9' : '#14121c';
  return (
    <span className="skeo-wm" style={{ fontSize: size, color: word }}>
      <span className="skeo-wm__word">Skeo</span>
      {tagline && <span className="skeo-wm__tagline" style={{ color: theme === 'dark' ? '#b9adf6' : '#6c4af2' }}>{tagline}</span>}
    </span>
  );
}

// The product name, set plainly. No rule, no dot, no borrowed lockup -- just
// the word in the display face, so it reads as this product's own name.
// theme: 'light' (on the page) | 'dark' (on the stage). Both grounds are dark
// now, so the word is white on either; only the tagline's blue shifts.
export default function SkeoWordmark({ size = 24, theme = 'light', tagline = '' }) {
  const word = '#f5f7fb';
  return (
    <span className="skeo-wm" style={{ fontSize: size, color: word }}>
      <span className="skeo-wm__word">skeo</span>
      {tagline && <span className="skeo-wm__tagline" style={{ color: theme === 'dark' ? '#8fbcff' : '#3d8bff' }}>{tagline}</span>}
    </span>
  );
}

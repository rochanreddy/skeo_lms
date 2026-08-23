// Generic page used for screens whose backend arrives in Phase 2. It still
// renders the exact sections from the spec so the app is fully navigable and
// the intended layout is visible.
export default function Placeholder({ title, blurb, sections = [] }) {
  return (
    <div>
      <h1>{title}</h1>
      {blurb && <p className="muted">{blurb}</p>}
      <div className="ph-grid">
        {sections.map((s) => (
          <div className="panel" key={s.title}>
            <h3>{s.title}</h3>
            <p className="muted">{s.detail}</p>
          </div>
        ))}
      </div>
      <p className="phase-note">⏳ Phase 2 — this screen's live data is wired next.</p>
    </div>
  );
}

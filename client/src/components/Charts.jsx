// Tiny dependency-free SVG charts for the admin panel.
// Palette: validated categorical slots (blue, orange, aqua) on the white card
// surface; sequential pairs are two steps of one hue. Legends always carry the
// values, so no reading depends on color alone.

export const SERIES = ['#6c4af2', '#eb6834', '#1baf7a'];
export const SEQ = { main: '#6c4af2', light: '#d8cfff' }; // purple + its tint
export const SEQ_AQUA = { main: '#1baf7a', light: '#b9e9d7' };

const polar = (cx, cy, r, angle) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];

// One donut segment as a closed path (outer arc → inner arc), with a small
// pad-angle so a 2px surface gap separates touching segments.
function segmentPath(cx, cy, rOuter, rInner, start, end, pad) {
  const a0 = start + pad;
  const a1 = Math.max(a0, end - pad);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`;
}

// Donut with legend. data: [{ label, value, color? }]. centerLabel overrides
// the default total in the middle.
export function Donut({ data, size = 132, thickness = 22, centerLabel, centerSub }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter - thickness;
  const visible = data.filter((d) => d.value > 0);
  const pad = visible.length > 1 ? 1 / rOuter : 0; // ≈2px surface gap
  let angle = -Math.PI / 2;

  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
        {total === 0 && <circle cx={cx} cy={cy} r={rOuter - thickness / 2} fill="none" stroke="#eceaf1" strokeWidth={thickness} />}
        {/* A single 100% segment is a full ring — an arc can't close on itself. */}
        {total > 0 && visible.length === 1 && (
          <circle cx={cx} cy={cy} r={rOuter - thickness / 2} fill="none" stroke={visible[0].color || SERIES[0]} strokeWidth={thickness}>
            <title>{`${visible[0].label}: ${visible[0].value} (100%)`}</title>
          </circle>
        )}
        {total > 0 && visible.length > 1 && visible.map((d, i) => {
          const sweep = (d.value / total) * Math.PI * 2;
          const path = segmentPath(cx, cy, rOuter, rInner, angle, angle + sweep, pad);
          angle += sweep;
          return (
            <path key={d.label} d={path} fill={d.color || SERIES[i % SERIES.length]}>
              <title>{`${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`}</title>
            </path>
          );
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="donut-center">{centerLabel ?? total}</text>
        {centerSub && <text x={cx} y={cy + 15} textAnchor="middle" className="donut-center-sub">{centerSub}</text>}
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => (
          <div className="donut-leg-row" key={d.label}>
            <span className="donut-swatch" style={{ background: d.color || SERIES[i % SERIES.length] }} />
            <span className="donut-leg-label">{d.label}</span>
            <span className="donut-leg-val">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Small line chart for trends. points: [{ label, count }].
export function MiniLine({ points, height = 120, color = SEQ.main }) {
  const w = 320;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;
  const max = Math.max(1, ...points.map((p) => p.count));
  const stepX = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const x = (i) => padX + i * stepX;
  const y = (v) => padTop + (1 - v / max) * (height - padTop - padBottom);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.count)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${height - padBottom} L ${x(0)} ${height - padBottom} Z`;
  const last = points[points.length - 1];

  return (
    <svg className="miniline" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={points.map((p) => `${p.label}: ${p.count}`).join(', ')}>
      <line x1={padX} x2={w - padX} y1={height - padBottom} y2={height - padBottom} stroke="#e8e5ed" strokeWidth="1" />
      {points.length > 0 && (
        <>
          <path d={area} fill={color} opacity="0.1" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(points.length - 1)} cy={y(last.count)} r="4" fill={color} stroke="#ffffff" strokeWidth="2" />
          <text x={x(points.length - 1)} y={y(last.count) - 8} textAnchor="end" className="miniline-val">{last.count}</text>
        </>
      )}
      {points.map((p, i) => (
        <g key={p.label}>
          {(i === 0 || i === points.length - 1) && (
            <text x={x(i)} y={height - 7} textAnchor={i === 0 ? 'start' : 'end'} className="miniline-tick">{p.label}</text>
          )}
          <circle cx={x(i)} cy={y(p.count)} r="9" fill="transparent"><title>{`${p.label}: ${p.count}`}</title></circle>
        </g>
      ))}
    </svg>
  );
}

// Slim progress meter — fill + lighter track of the same hue.
export function Meter({ pct, color = SEQ.main, track = SEQ.light }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="meter" role="img" aria-label={`${v}%`}>
      <div className="meter-track" style={{ background: track }}>
        <div className="meter-fill" style={{ width: `${v}%`, background: color }} />
      </div>
      <span className="meter-val">{pct == null ? '—' : `${v}%`}</span>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import LineIcon from './LineIcon.jsx';

// A drop-in replacement for <input type="datetime-local">, which renders as a
// different (and uniformly ugly) native widget in every browser. Same value
// contract as the native input — 'YYYY-MM-DDTHH:mm' or '' — so call sites only
// change from `e.target.value` to the value itself.

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function parseValue(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const toValue = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const sameDay = (a, b) => !!a && !!b
  && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function DateTimePicker({ value, onChange, placeholder = 'Pick date & time', id }) {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected || new Date());
  const wrapRef = useRef(null);

  // Follow the value when it changes from outside (e.g. the form resetting).
  useEffect(() => { const d = parseValue(value); if (d) setView(d); }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const today = new Date();

  // Always a full 6×7 grid so the popover never changes height month to month.
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysThis = new Date(year, month + 1, 0).getDate();
  const daysPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    const day = daysPrev - firstWeekday + 1 + i;
    cells.push({ day, out: true, date: new Date(year, month - 1, day) });
  }
  for (let d = 1; d <= daysThis; d += 1) cells.push({ day: d, out: false, date: new Date(year, month, d) });
  for (let d = 1; cells.length < 42; d += 1) cells.push({ day: d, out: true, date: new Date(year, month + 1, d) });

  // Keep the time when only the day changes; default new picks to 09:00.
  function pickDay(date) {
    const base = selected || new Date(new Date().setHours(9, 0, 0, 0));
    onChange(toValue(new Date(date.getFullYear(), date.getMonth(), date.getDate(), base.getHours(), base.getMinutes())));
  }

  function setTime(h, m) {
    const base = selected || new Date();
    onChange(toValue(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m)));
  }

  const shiftMonth = (n) => setView(new Date(year, month + n, 1));

  // 5-minute steps, plus the current value if it isn't on one.
  const minutes = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), selected?.getMinutes() ?? 0])]
    .sort((a, b) => a - b);

  const label = selected
    ? selected.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : placeholder;

  return (
    <div className="dtp" ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={`dtp-field ${selected ? '' : 'is-empty'}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <LineIcon name="clock" size={14} />
        <span className="dtp-label">{label}</span>
        {selected && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
            className="dtp-clear"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onChange(''); } }}
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div className="dtp-pop" role="dialog" aria-label="Choose date and time">
          <div className="dtp-head">
            <button type="button" className="dtp-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <div className="dtp-month">{MONTHS[month]} {year}</div>
            <button type="button" className="dtp-nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>

          <div className="dtp-grid dtp-dow">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="dtp-grid">
            {cells.map((c, i) => (
              <button
                key={`${c.date.getTime()}-${i}`}
                type="button"
                className={`dtp-day${c.out ? ' out' : ''}${sameDay(c.date, selected) ? ' on' : ''}${sameDay(c.date, today) ? ' today' : ''}`}
                onClick={() => pickDay(c.date)}
              >
                {c.day}
              </button>
            ))}
          </div>

          <div className="dtp-time">
            <span className="dtp-time-label">Time</span>
            <select value={selected?.getHours() ?? 9} onChange={(e) => setTime(+e.target.value, selected?.getMinutes() ?? 0)}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}</option>)}
            </select>
            <span className="dtp-colon">:</span>
            <select value={selected?.getMinutes() ?? 0} onChange={(e) => setTime(selected?.getHours() ?? 9, +e.target.value)}>
              {minutes.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
            </select>
          </div>

          <div className="dtp-foot">
            <button type="button" className="dtp-link" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
            <div className="dtp-foot-right">
              <button type="button" className="dtp-link" onClick={() => { const n = new Date(); setView(n); onChange(toValue(n)); }}>Now</button>
              <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

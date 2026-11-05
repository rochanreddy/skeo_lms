import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { HourBars, Meter, MiniLine, SERIES } from '../../components/Charts.jsx';
import {
  PRICES_CHECKED, PRICE_SOURCES, RUSH_SECONDS, planHosting, ratesFrom,
} from '../../lib/capacityPlan.js';

/**
 * Admin: what students actually do, and what that means for hosting.
 *
 * The answer comes first and the evidence under it, because the question that
 * brings someone here is "which plan?" and not "how many requests?". Every input
 * starts at what was measured and can be changed, so "what if we enrol 2000" is
 * one number away. Nothing is saved: planning a bigger cohort changes no setting.
 */

const RANGES = [7, 30, 90];
const MY_HOUR_USD = 10;
const RENDER_INCLUDED_GB = 5;
const RENDER_PER_GB = 0.15;

const whole = (n) => Math.round(n).toLocaleString('en-IN');
const usd = (n) => `$${n >= 100 || Number.isInteger(n) ? Math.round(n) : n.toFixed(2)}`;
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function size(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)}MB`;
  return `${Math.round(bytes / 1e3)}KB`;
}

const wait = (s) => (s < 1 ? 'under 1s' : `${Math.round(s)}s`);

/* Status colour says how near a limit something is. The figure and the word
 * beside it say the same, so none of this depends on seeing the colour. */
const pressure = (pct) => {
  if (pct >= 90) return { color: 'var(--red)', word: 'At its limit' };
  if (pct >= 70) return { color: 'var(--amber)', word: 'Getting close' };
  return { color: SERIES[0], word: 'Plenty of room' };
};

function Gauge({ label, value, pct, word }) {
  const level = pressure(pct);
  return (
    <div className="us-gauge">
      <div className="us-gauge-head">
        <span>{label}</span>
        <span className="us-gauge-value">{value}</span>
      </div>
      <Meter pct={Math.round(pct)} color={level.color} track="var(--line)" />
      <span className="us-gauge-word">{word || level.word}</span>
    </div>
  );
}

function Field({ label, hint, value, onChange, min, max, suffix }) {
  return (
    <label className="us-field">
      {label}
      <span className="us-input">
        <input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="us-suffix">{suffix}</span>}
      </span>
      <small>{hint}</small>
    </label>
  );
}

function HostRow({ host, best }) {
  const isBest = best?.id === host.id;
  const note = host.wastesCores
    ? 'No gain. The API runs on one core.'
    : host.fits ? '' : `Too small: limited by ${host.limitedBy}.`;
  return (
    <tr className={`${isBest ? 'us-best' : ''} ${host.fits && !host.wastesCores ? '' : 'us-out'}`}>
      <th scope="row">
        {host.name}
        {isBest && <span className="us-pick">Best fit</span>}
        {note && <small>{note}</small>}
      </th>
      <td>{usd(host.monthly)}</td>
      <td>{usd(host.withTime)}</td>
      <td>{whole(host.maxStudents)}</td>
      <td>{wait(host.rushSeconds)}</td>
      <td>{host.bandwidthCost ? usd(host.bandwidthCost) : 'Included'}</td>
    </tr>
  );
}

function Calculator({ data }) {
  const { evidence, peaks, database } = data;
  const rates = ratesFrom(evidence);
  const [edits, setEdits] = useState({});

  const fallback = {
    students: evidence.studentsNow || 500,
    peak: Math.max(1, Math.round(rates.peakShare * 100)),
    daily: Math.max(1, Math.round(rates.dailyShare * 100)),
    hour: MY_HOUR_USD,
  };
  const shown = (key) => edits[key] ?? fallback[key];
  const number = (key) => {
    const n = Number(shown(key));
    return Number.isFinite(n) && n > 0 ? n : fallback[key];
  };
  const set = (key) => (value) => setEdits((e) => ({ ...e, [key]: value }));

  const students = number('students');
  const plan = planHosting({
    students,
    peakShare: Math.min(1, number('peak') / 100),
    dailyShare: Math.min(1, number('daily') / 100),
    hourRate: Number(shown('hour')) || 0,
    rates,
    memoryMb: peaks.rssMb,
    database: database && { ...database, studentsNow: evidence.studentsNow },
  });
  const { best, next, hosts } = plan;

  // The AWS question gets its own line: it is why this screen exists.
  const aws = hosts.filter((h) => h.provider === 'AWS' && h.fits).sort((a, b) => a.monthly - b.monthly)[0];
  const awsSaving = best && aws && best.provider !== 'AWS' ? best.monthly - aws.monthly : 0;

  return (
    <section className="panel us-plan" aria-labelledby="us-answer">
      <div className="eyebrow">What to run on</div>
      {best ? (
        <>
          <h2 id="us-answer">{best.name} covers {whole(students)} students.</h2>
          <p className="us-lede">
            About {usd(best.monthly)} a month, and it holds up to about {whole(best.maxStudents)} students.
            {next && ` After that, ${next.name} at ${usd(next.price)} a month.`}
          </p>
        </>
      ) : (
        <>
          <h2 id="us-answer">One server does not cover {whole(students)} students.</h2>
          <p className="us-lede">
            The API runs as a single process, so a bigger plan stops helping once it fills one core.
            Past that it needs Redis and a second process, which is a code change before it is a hosting one.
          </p>
        </>
      )}

      <p className="us-basis">
        {rates.measured
          ? `Going by real use: ${evidence.daysMeasured} days, with up to ${whole(evidence.peakOnline)} students online together.`
          : `Going by the load test and assumptions, not real students yet. It switches over by itself after ${evidence.needs.days} days of use, ${evidence.needs.peakOnline} students online together and ${whole(evidence.needs.requests)} requests.`}
      </p>

      <div className="us-fields">
        <Field label="Students enrolled" hint={`${whole(evidence.studentsNow)} today`} min={1} value={shown('students')} onChange={set('students')} />
        <Field label="Online at the busiest moment" hint={rates.measured ? 'Measured' : 'Assumed'} suffix="%" min={1} max={100} value={shown('peak')} onChange={set('peak')} />
        <Field label="Active on a typical day" hint={rates.measured ? 'Measured' : 'Assumed'} suffix="%" min={1} max={100} value={shown('daily')} onChange={set('daily')} />
        <Field label="An hour of your time" hint="Assumed. Set to 0 for price alone." suffix="USD" min={0} value={shown('hour')} onChange={set('hour')} />
      </div>

      <div className="table-wrap">
        <table className="grade-table us-table">
          <caption className="us-caption">
            {whole(plan.online)} students online at the busiest moment, {plan.gbPerMonth < 1 ? 'under 1GB' : `about ${Math.round(plan.gbPerMonth)}GB`} of bandwidth a month.
          </caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">A month</th>
              <th scope="col">With your time</th>
              <th scope="col">Holds up to</th>
              <th scope="col">Rush wait</th>
              <th scope="col">Extra bandwidth</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => <HostRow key={h.id} host={h} best={best} />)}
          </tbody>
        </table>
      </div>
      <p className="us-note">
        Rush wait is how long the last student waits if everyone online opens the app in the same moment. Plans are
        judged on under {RUSH_SECONDS} seconds, and on staying under 70% busy. Your time on AWS is 3 hours a month for
        security updates, certificates, deploys and restarts, which Render does for you.
      </p>

      {awsSaving > 0 && (
        <p className="us-callout">
          {aws.name} would save {usd(awsSaving)} a month in cash, and cost about {aws.opsHours} hours a month of your time.
        </p>
      )}

      <p className="us-callout">
        Database: {plan.database.tier.name} is the smallest that fits, at {plan.database.tier.price} a month. That is about{' '}
        {Math.round(plan.database.opsPerSecond)} operations a second
        {database ? ` and ${plan.database.storageMb >= 1000 ? `${(plan.database.storageMb / 1000).toFixed(1)}GB` : `${Math.round(plan.database.storageMb)}MB`} of data` : ''}.
      </p>
    </section>
  );
}

function Health({ data }) {
  const { peaks, live, totals } = data;
  const { limits } = live;
  const cpuLimit = limits.cpuLimit ?? 1;
  const memoryLimit = limits.memoryLimitMb ?? 512;
  const perMonth = totals.activeDays ? (totals.bytesOut / totals.activeDays) * 30 : 0;
  // Past the allowance nothing stops working. It just costs, so say what.
  const overGb = Math.max(0, perMonth / 1e9 - RENDER_INCLUDED_GB);

  const found = [
    limits.cpuLimit ? `${limits.cpuLimit} CPU` : `${limits.cpusVisible} CPU${limits.cpusVisible === 1 ? '' : 's'}, no limit set`,
    limits.memoryLimitMb ? `${whole(limits.memoryLimitMb)}MB of memory` : 'no memory limit set',
    `a ${Math.round(limits.heapLimitMb)}MB heap`,
  ].join(', ');

  return (
    <section className="panel us-health">
      <div className="eyebrow">How hard the server worked</div>
      <div className="us-gauges">
        <Gauge label="CPU at the busiest moment" value={`${peaks.cores.toFixed(2)} of ${cpuLimit} core`} pct={(peaks.cores / cpuLimit) * 100} />
        <Gauge label="Memory at the highest" value={`${whole(peaks.rssMb)}MB of ${whole(memoryLimit)}MB`} pct={(peaks.rssMb / memoryLimit) * 100} />
        <Gauge label="Database connections in use" value={`${peaks.dbConns} of 20`} pct={(peaks.dbConns / 20) * 100} />
        <Gauge
          label="Bandwidth at this rate"
          value={`${size(perMonth)} a month, ${RENDER_INCLUDED_GB}GB included`}
          pct={(perMonth / (RENDER_INCLUDED_GB * 1e9)) * 100}
          word={overGb > 0 ? `Over the Render allowance: about ${usd(overGb * RENDER_PER_GB)} a month extra` : 'Inside the Render allowance'}
        />
      </div>
      <dl className="us-facts">
        <div><dt>Response time</dt><dd>{peaks.p50Ms ? `Half under ${peaks.p50Ms}ms, 95% under ${peaks.p95Ms}ms` : 'No requests yet'}</dd></div>
        <div><dt>Longest queue for the CPU</dt><dd>{Math.round(peaks.loopMs)}ms</dd></div>
        <div><dt>Most requests a second</dt><dd>{Math.round(peaks.rps)}</dd></div>
        <div><dt>Server errors</dt><dd>{whole(totals.serverErrors)}</dd></div>
        <div><dt>Refused by the rate limiter</dt><dd>{whole(totals.limited)}</dd></div>
        <div><dt>Restarts</dt><dd>{totals.restarts} <small>deploys count too</small></dd></div>
      </dl>
      <p className="us-note">This server can see: {found}.</p>
    </section>
  );
}

function Busiest({ routes }) {
  const time = routes.reduce((n, r) => n + r.ms, 0);
  if (!routes.length) return null;
  return (
    <section className="panel">
      <div className="eyebrow">Where the time goes</div>
      <div className="table-wrap">
        <table className="grade-table us-table">
          <thead>
            <tr>
              <th scope="col">Part of the app</th>
              <th scope="col">Requests</th>
              <th scope="col">Share of time spent</th>
            </tr>
          </thead>
          <tbody>
            {routes.slice(0, 10).map((r) => (
              <tr key={r.area}>
                <th scope="row" className="gb-rowhead us-area">{r.area === 'other' ? 'Other' : r.area}</th>
                <td>{whole(r.requests)}</td>
                <td className="us-share"><Meter pct={time ? Math.round((r.ms / time) * 100) : 0} track="var(--line)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Daily({ daily }) {
  return (
    <section className="panel">
      <div className="eyebrow">Day by day</div>
      <div className="table-wrap">
        <table className="grade-table us-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Active</th>
              <th scope="col">Most online</th>
              <th scope="col">Requests</th>
              <th scope="col">Data sent</th>
              <th scope="col">Video starts</th>
              <th scope="col">Errors</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().slice(0, 14).map((d) => (
              <tr key={d.day}>
                <th scope="row" className="gb-rowhead">{dayLabel(d.day)}</th>
                <td>{whole(d.students)}</td>
                <td>{whole(d.peakOnline)}</td>
                <td>{whole(d.requests)}</td>
                <td>{size(d.bytesOut)}</td>
                <td>{whole(d.videoPlays)}</td>
                <td>{whole(d.serverErrors)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminUsage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let current = true;
    setErr('');
    api(`/usage?days=${days}`)
      .then((d) => { if (current) setData(d); })
      .catch((e) => { if (current) setErr(e.message); });
    return () => { current = false; };
  }, [days]);

  const head = (
    <div className="page-head">
      <div>
        <div className="eyebrow">Admin</div>
        <p className="greet">What students actually use.</p>
        <p>Real numbers from the running app, and the plan they point to.</p>
      </div>
      <div className="us-range" role="group" aria-label="Period">
        {RANGES.map((n) => (
          <button key={n} type="button" className={`btn sm ${n === days ? '' : 'ghost'}`} aria-pressed={n === days} onClick={() => setDays(n)}>
            {n} days
          </button>
        ))}
      </div>
    </div>
  );

  if (err) return <div>{head}<div className="error">{err}</div></div>;
  if (!data) return <div>{head}<div className="panel skeleton-row" style={{ height: 320 }} /></div>;

  const { live, peaks, totals, daily, hours, routes } = data;
  const empty = totals.requests === 0;
  const tiles = [
    { label: 'Online now', value: whole(live.online) },
    { label: 'Most online together', value: whole(peaks.online) },
    { label: 'Active a day', value: whole(totals.avgDailyStudents) },
    { label: 'Video starts', value: whole(totals.videoPlays) },
  ];

  return (
    <div className="us-page">
      {head}
      <Calculator data={data} />

      <div className="stats us-stats">
        {tiles.map((t) => (
          <div className="stat" key={t.label}>
            <div className="stat-label">{t.label}</div>
            <div className="stat-value">{t.value}</div>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="panel empty-state">
          <p className="muted">Nothing recorded in this period yet. Counting starts as soon as this version is live, and new numbers land once a minute.</p>
        </div>
      ) : (
        <>
          <div className="detail-charts us-charts">
            <div className="panel chart-card">
              <div className="eyebrow">Most students online, each day</div>
              <MiniLine points={daily.map((d) => ({ label: dayLabel(d.day), count: d.peakOnline }))} />
            </div>
            <div className="panel chart-card">
              <div className="eyebrow">Busiest hours, India time</div>
              <HourBars hours={hours} />
            </div>
          </div>
          <Health data={data} />
          <Busiest routes={routes} />
          <Daily daily={daily} />
        </>
      )}

      <p className="us-note us-foot">
        Online means a request in the last five minutes. Video is not in these numbers: students stream from VdoCipher,
        which bills that bandwidth separately, so a lesson costs this server one ticket however long it plays. A video
        start is one ticket. Render bandwidth is shared across the workspace, so anything else hosted there uses the same
        5GB. Prices checked {PRICES_CHECKED}, in USD, before tax:{' '}
        {PRICE_SOURCES.map((s, i) => (
          <span key={s.href}>
            {i > 0 && ', '}
            <a href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
          </span>
        ))}.
      </p>
    </div>
  );
}

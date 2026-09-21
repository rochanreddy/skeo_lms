import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.jsx';

/**
 * The job board.
 *
 * One list, the same for students and admins: openings scraped from ten
 * sources every morning, plus any an admin typed in. Nothing is vetted — the
 * feed goes straight through, and the only thing an admin can do that a
 * student can't is add an opening and remove one they added.
 *
 * Listings show for ten days from the date the role opened and then drop off
 * on their own, so the board is always the last ten days rather than an
 * archive nobody prunes.
 *
 * The page is laid out as a board: search across the top, the filters in a
 * sticky rail down the side, listings filling the rest. The filters used to
 * run across the content column, which put the first opening below the fold —
 * on a page whose whole job is showing openings.
 */

const PLACES = [
  { value: 'India', label: 'India' },
  { value: 'International', label: 'International' },
  { value: 'Remote', label: 'Remote' },
];

/** Query-string state, so a filtered board can be linked to and comes back. */
const buildQuery = (filters, page) => {
  const q = new URLSearchParams();
  filters.category.forEach((v) => q.append('category', v));
  filters.workType.forEach((v) => q.append('workType', v));
  filters.experience.forEach((v) => q.append('experience', v));
  filters.place.forEach((v) => q.append('place', v));
  if (filters.search) q.set('search', filters.search);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `/jobs?${s}` : '/jobs';
};

/** How long ago, in the units people actually think in. */
function ago(value) {
  if (!value) return '';
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

/** Posted in the last two days. Worth saying loudly on a ten-day board. */
const isFresh = (value) =>
  Boolean(value) && Date.now() - new Date(value).getTime() < 2 * 86400000;

/**
 * A company's monogram and its colour.
 *
 * Both come from the name, so a company keeps the same square everywhere and
 * on every reload — the point is to be able to scan a long list by shape and
 * colour, which a random tone each render would defeat.
 */
function monogram(company) {
  const name = (company || '?').trim();
  const words = name.split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return { initials, tone: String((hash % 6) + 1) };
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const EMPTY = { category: [], workType: [], experience: [], place: [], search: '' };

export default function JobBoard() {
  const { user } = useOutletContext();
  const isAdmin = user.role === 'admin';

  const [filters, setFilters] = useState(EMPTY);
  const [searchBox, setSearchBox] = useState('');
  const [page, setPage] = useState(1);
  // Only ever true on narrow screens, where the rail collapses to a disclosure.
  const [railOpen, setRailOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);

  const [data, setData] = useState({ jobs: [], total: 0, pages: 1, facets: null, feedAvailable: true });
  // An empty list before the first response is "not known yet", not "none".
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api(buildQuery(filters, page))
      .then((d) => { setData(d); setErr(''); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const toggle = (key, value) => {
    setPage(1);
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  };

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setFilters((f) => ({ ...f, search: searchBox.trim() }));
  };

  const clearSearch = () => {
    setSearchBox('');
    setPage(1);
    setFilters((f) => ({ ...f, search: '' }));
  };

  const clearAll = () => {
    setSearchBox('');
    setPage(1);
    setFilters(EMPTY);
  };

  const facets = data.facets;

  const groups = useMemo(() => {
    if (!facets) return [];
    return [
      { key: 'category', label: 'Category', options: facets.categories },
      { key: 'place', label: 'Place', options: PLACES },
      { key: 'workType', label: 'Type', options: facets.workTypes },
      { key: 'experience', label: 'Level', options: facets.levels },
    ];
  }, [facets]);

  /**
   * Slug → label, for the tags on a card.
   *
   * Listings store slugs ('AI-NonTech', 'full-time') because labels get
   * reworded and rewriting thousands of rows over a copy edit shouldn't be
   * possible. The board is where they get read, so this is where they get
   * turned back into words — the facets carry both halves already.
   */
  const labelOf = useMemo(() => {
    const map = new Map();
    if (facets) {
      [...facets.categories, ...facets.workTypes, ...facets.levels]
        .forEach((o) => map.set(o.value, o.label));
    }
    return (value) => map.get(value) || value;
  }, [facets]);

  /** Every filter that is on, flattened into one removable strip. */
  const active = useMemo(() => {
    const out = [];
    if (filters.search) out.push({ key: 'search', value: '', label: `“${filters.search}”` });
    groups.forEach((g) => {
      filters[g.key].forEach((v) => {
        const opt = g.options.find((o) => o.value === v);
        out.push({ key: g.key, value: v, label: opt ? opt.label : v });
      });
    });
    return out;
  }, [filters, groups]);

  const dropFilter = (f) => (f.key === 'search' ? clearSearch() : toggle(f.key, f.value));

  return (
    <div className="jb">
      <div className="page-head">
        <div>
          <div className="eyebrow">Job Board</div>
          <h1>Openings</h1>
          <p>
            Roles from across the web, refreshed every morning, plus openings shared by the
            team. Listings stay up for ten days from the day they were posted.
          </p>
        </div>
        {isAdmin && !postOpen && (
          <button className="btn sm" onClick={() => setPostOpen(true)}>Post an opening</button>
        )}
      </div>

      {isAdmin && postOpen && (
        <AdminPost onPosted={load} onClose={() => setPostOpen(false)} facets={facets} />
      )}

      {!data.feedAvailable && !loading && (
        <p className="panel" role="status">
          The jobs feed can&apos;t be reached right now, so this is only what the team has
          posted. It usually comes back on its own — nothing here is lost.
        </p>
      )}

      <form className="jb-search" onSubmit={submitSearch} role="search">
        <div className="jb-search-field">
          <SearchIcon />
          <input
            id="job-search"
            type="search"
            aria-label="Search openings"
            placeholder="Search by title or company"
            value={searchBox}
            onChange={(e) => setSearchBox(e.target.value)}
          />
        </div>
        <button className="btn">Search</button>
        <button
          type="button"
          className="btn quiet jb-filter-toggle"
          aria-expanded={railOpen}
          onClick={() => setRailOpen((v) => !v)}
        >
          {railOpen ? 'Hide filters' : 'Filters'}
          {active.length > 0 && !railOpen ? ` (${active.length})` : ''}
        </button>
      </form>

      {err && <p className="panel error" role="alert">{err}</p>}

      <div className="jb-layout">
        <aside className={`jb-rail ${railOpen ? 'open' : ''}`} aria-label="Filters">
          {groups.map((g) => (
            <div key={g.key} className="jb-group">
              <div className="jb-group-label">{g.label}</div>
              <div className="jb-chips">
                {g.options.map((o) => {
                  const on = filters[g.key].includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`filter-chip ${on ? 'active' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(g.key, o.value)}
                    >
                      {on && <CheckIcon />}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <div>
          <div className="jb-count">
            <strong>
              {loading
                ? 'Loading…'
                : `${data.total.toLocaleString('en-IN')} ${data.total === 1 ? 'opening' : 'openings'}`}
            </strong>
            {!loading && data.pages > 1 && <span>Page {page} of {data.pages}</span>}
          </div>

          {active.length > 0 && (
            <div className="jb-active">
              {active.map((f) => (
                <button
                  key={`${f.key}:${f.value}`}
                  type="button"
                  className="jb-active-chip"
                  onClick={() => dropFilter(f)}
                  aria-label={`Remove filter ${f.label}`}
                >
                  {f.label}
                  <CloseIcon />
                </button>
              ))}
              <button type="button" className="btn sm ghost" onClick={clearAll}>Clear all</button>
            </div>
          )}

          <div className="list">
            {loading && [0, 1, 2, 3].map((n) => <div key={n} className="skeleton-row tall" />)}

            {!loading && data.jobs.length === 0 && (
              <div className="empty">
                <div className="empty-icon" aria-hidden="true">🔍</div>
                <strong>{active.length ? 'Nothing matches those filters' : 'No openings right now'}</strong>
                {active.length
                  ? 'Loosen one of them, or clear them all and start again.'
                  : 'The board refreshes every morning — check back tomorrow.'}
              </div>
            )}

            {!loading && data.jobs.map((j) => (
              <JobCard key={j.id} job={j} isAdmin={isAdmin} onRemoved={load} labelOf={labelOf} />
            ))}
          </div>

          {!loading && data.pages > 1 && (
            <div className="jb-pager">
              <button className="btn sm quiet" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Previous
              </button>
              <span>{page} / {data.pages}</span>
              <button className="btn sm quiet" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, isAdmin, onRemoved, labelOf }) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm('Remove this posting?')) return;
    setBusy(true);
    try {
      await api(`/jobs/${job.id}`, { method: 'DELETE' });
      onRemoved();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const place = job.location || job.country || '';
  const { initials, tone } = monogram(job.company);
  const fresh = isFresh(job.postedAt);
  // 'unspecified' is a real answer from the pipeline, but it is not a tag.
  const workType = job.workType !== 'unspecified' ? job.workType : '';
  const level = job.experienceLevel !== 'unspecified' ? job.experienceLevel : '';

  return (
    <article className="job-card">
      <div className="job-card-head">
        <div className="job-logo" data-tone={tone} aria-hidden="true">{initials}</div>

        <div className="job-id">
          <h3 className="job-title">
            {/* The link stretches over the card, so the whole listing opens the
                posting while the accessible name stays the role itself. */}
            {job.url ? (
              <a href={job.url} target="_blank" rel="noreferrer noopener">
                {job.title || 'Untitled posting'}
              </a>
            ) : (
              job.title || 'Untitled posting'
            )}
          </h3>
          <div className="job-meta">
            <b>{job.company || 'Company not stated'}</b>
            {place && <><i>•</i><span>{place}</span></>}
          </div>
        </div>

        {fresh ? (
          <span className="job-new">{ago(job.postedAt)}</span>
        ) : (
          <span className="job-age">{ago(job.postedAt)}</span>
        )}
      </div>

      <div className="job-tags">
        {job.roleCategory && <span className="job-tag cat">{labelOf(job.roleCategory)}</span>}
        {job.origin === 'manual' && <span className="job-tag team">Shared by the team</span>}
        {job.country === 'India' && <span className="job-tag">India</span>}
        {job.isRemote && <span className="job-tag">Remote</span>}
        {workType && <span className="job-tag">{labelOf(workType)}</span>}
        {/* An internship is a level and an engagement at once, and the feed
            tags it as both — printing it twice makes the row look broken. */}
        {level && level !== workType && <span className="job-tag">{labelOf(level)}</span>}
      </div>

      {/* Why this listing is where it is. The board ranks on how well a job
          matches what the course actually teaches, and these are the terms it
          matched — without them a student has no way to tell a ranked list
          from an arbitrary one. */}
      {job.matchedSkills?.length > 0 && (
        <p className="job-match">
          Matches what you&apos;re learning: <b>{job.matchedSkills.join(' · ')}</b>
        </p>
      )}

      {job.description && <p className="job-desc">{job.description}</p>}

      {/* Only the team's own postings can be removed — a scraped listing has
          no record here to delete, and drops off by itself. */}
      {isAdmin && job.origin === 'manual' && (
        <div className="job-actions">
          <button className="btn sm ghost-danger" onClick={remove} disabled={busy}>
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      )}
    </article>
  );
}

const BLANK_FORM = {
  title: '',
  company: '',
  location: '',
  applyUrl: '',
  description: '',
  roleCategory: '',
  workType: 'unspecified',
  experienceLevel: 'unspecified',
  isRemote: false,
};

function AdminPost({ onPosted, onClose, facets }) {
  const [form, setForm] = useState(BLANK_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/jobs', {
        method: 'POST',
        body: { ...form, roleCategory: form.roleCategory || null },
      });
      setForm(BLANK_FORM);
      onClose();
      onPosted();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="jb-post-head">
        <div>
          <h3 style={{ margin: 0 }}>Post an opening</h3>
          <p className="muted">
            For roles that never reach a job board. It appears at the top of the list for
            everyone, and drops off after ten days like any other.
          </p>
        </div>
        <button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button>
      </div>

      <div className="field-grid" style={{ marginTop: 18 }}>
        <label>
          Title
          <input value={form.title} onChange={(e) => set('title', e.target.value)} required />
        </label>
        <label>
          Company
          <input value={form.company} onChange={(e) => set('company', e.target.value)} required />
        </label>
        <label>
          Location
          <input
            placeholder="Bengaluru, or Anywhere"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </label>
        <label>
          Apply link
          <input
            type="url"
            placeholder="https://"
            value={form.applyUrl}
            onChange={(e) => set('applyUrl', e.target.value)}
          />
        </label>

        {/* A Select isn't a form control a <label> can own, so the caption is
            a sibling and the trigger names itself. */}
        <div className="jb-field">
          <span>Category</span>
          <Select value={form.roleCategory || 'none'} onValueChange={(v) => set('roleCategory', v === 'none' ? '' : v)}>
            <SelectTrigger aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {(facets?.categories || []).map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="jb-field">
          <span>Type</span>
          <Select value={form.workType} onValueChange={(v) => set('workType', v)}>
            <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(facets?.workTypes || []).map((w) => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="jb-field">
          <span>Level</span>
          <Select value={form.experienceLevel} onValueChange={(v) => set('experienceLevel', v)}>
            <SelectTrigger aria-label="Level"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(facets?.levels || []).map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="jb-check">
          <input
            type="checkbox"
            checked={form.isRemote}
            onChange={(e) => set('isRemote', e.target.checked)}
          />
          Remote
        </label>
      </div>

      <label>
        Description
        <textarea
          rows={3}
          placeholder="Optional — what the role is, and who it suits."
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn sm" disabled={busy}>{busy ? 'Posting…' : 'Post opening'}</button>
        {err && <span className="error" role="alert">{err}</span>}
      </div>
    </form>
  );
}

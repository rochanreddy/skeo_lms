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

const EMPTY = { category: [], workType: [], experience: [], place: [], search: '' };

export default function JobBoard() {
  const { user } = useOutletContext();
  const isAdmin = user.role === 'admin';

  const [filters, setFilters] = useState(EMPTY);
  const [searchBox, setSearchBox] = useState('');
  const [page, setPage] = useState(1);

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

  const clearAll = () => {
    setSearchBox('');
    setPage(1);
    setFilters(EMPTY);
  };

  const facets = data.facets;
  const anyFilter =
    filters.search ||
    filters.category.length ||
    filters.workType.length ||
    filters.experience.length ||
    filters.place.length;

  const groups = useMemo(() => {
    if (!facets) return [];
    return [
      { key: 'category', label: 'Category', options: facets.categories },
      { key: 'place', label: 'Place', options: PLACES },
      { key: 'workType', label: 'Type', options: facets.workTypes },
      { key: 'experience', label: 'Level', options: facets.levels },
    ];
  }, [facets]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Job Board</div>
          <h1>Openings</h1>
          <p>
            Roles from across the web, refreshed every morning, plus openings shared by the
            team. Listings stay up for ten days from the day they were posted.
          </p>
        </div>
      </div>

      {isAdmin && <AdminPost onPosted={load} facets={facets} />}

      {!data.feedAvailable && !loading && (
        <p className="panel" role="status" style={{ marginTop: 14 }}>
          The jobs feed can&apos;t be reached right now, so this is only what the team has
          posted. It usually comes back on its own — nothing here is lost.
        </p>
      )}

      <form className="panel" onSubmit={submitSearch} style={{ marginTop: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="job-search"
            type="search"
            placeholder="Search title or company"
            value={searchBox}
            onChange={(e) => setSearchBox(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn sm">Search</button>
        </div>

        {groups.map((g) => (
          <div key={g.key} className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span className="muted" style={{ width: 74, flex: 'none', fontSize: 12, lineHeight: '26px' }}>
              {g.label}
            </span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', flex: 1 }}>
              {g.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`filter-chip ${filters[g.key].includes(o.value) ? "active" : ""}`}
                  aria-pressed={filters[g.key].includes(o.value)}
                  onClick={() => toggle(g.key, o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted">
            {loading ? 'Loading…' : `${data.total.toLocaleString('en-IN')} matching`}
          </span>
          {anyFilter ? (
            <button type="button" className="btn sm ghost" onClick={clearAll}>Clear all</button>
          ) : null}
        </div>
      </form>

      {err && <p className="panel error" role="alert" style={{ marginTop: 14 }}>{err}</p>}

      <div className="list" style={{ marginTop: 14 }}>
        {loading && [0, 1, 2].map((n) => <div key={n} className="panel skeleton-row" style={{ height: 104 }} />)}

        {!loading && data.jobs.length === 0 && (
          <p className="muted">
            {anyFilter
              ? 'Nothing matches those filters. Loosen one, or clear them all.'
              : 'No openings right now. The board refreshes every morning.'}
          </p>
        )}

        {!loading && data.jobs.map((j) => (
          <JobCard key={j.id} job={j} isAdmin={isAdmin} onRemoved={load} />
        ))}
      </div>

      {!loading && data.pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 18 }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="muted">{page} / {data.pages}</span>
          <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function JobCard({ job, isAdmin, onRemoved }) {
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

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px' }}>{job.title || 'Untitled posting'}</h3>
          <div className="muted">
            {job.company || 'Company not stated'}
            {place ? ` — ${place}` : ''}
          </div>
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>{ago(job.postedAt)}</span>
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {job.roleCategory && <span className="badge badge-accent">{job.roleCategory}</span>}
        {job.country === 'India' && <span className="badge">India</span>}
        {job.isRemote && <span className="badge">Remote</span>}
        {job.workType && job.workType !== 'unspecified' && <span className="badge">{job.workType}</span>}
        {job.experienceLevel && job.experienceLevel !== 'unspecified' && (
          <span className="badge">{job.experienceLevel}</span>
        )}
        {job.origin === 'manual' && <span className="badge">Shared by the team</span>}
      </div>

      {job.description && <p style={{ margin: '10px 0 0' }}>{job.description}</p>}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {job.url && (
          <a className="btn sm" href={job.url} target="_blank" rel="noreferrer noopener">
            Apply →
          </a>
        )}
        {/* Only the team's own postings can be removed — a scraped listing has
            no record here to delete, and drops off by itself. */}
        {isAdmin && job.origin === 'manual' && (
          <button className="btn sm ghost-danger" onClick={remove} disabled={busy}>
            {busy ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </div>
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

function AdminPost({ onPosted, facets }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      onPosted();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn sm" onClick={() => setOpen(true)}>Post an opening</button>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={submit} style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Post an opening</h3>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        For roles that never reach a job board. It appears at the top of the list for
        everyone, and drops off after ten days like any other.
      </p>

      <div className="inline-form" style={{ marginTop: 10 }}>
        <input placeholder="Title" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <input placeholder="Company" value={form.company} onChange={(e) => set('company', e.target.value)} />
        <input placeholder="Location" value={form.location} onChange={(e) => set('location', e.target.value)} />
        <input placeholder="Apply link" value={form.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} />
      </div>

      <div className="inline-form" style={{ marginTop: 10 }}>
        <Select value={form.roleCategory || 'none'} onValueChange={(v) => set('roleCategory', v === 'none' ? '' : v)}>
          <SelectTrigger aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category</SelectItem>
            {(facets?.categories || []).map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={form.workType} onValueChange={(v) => set('workType', v)}>
          <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(facets?.workTypes || []).map((w) => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={form.experienceLevel} onValueChange={(v) => set('experienceLevel', v)}>
          <SelectTrigger aria-label="Level"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(facets?.levels || []).map((l) => (
              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="row" style={{ gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.isRemote}
            onChange={(e) => set('isRemote', e.target.checked)}
          />
          <span className="muted">Remote</span>
        </label>
      </div>

      <textarea
        style={{ marginTop: 10, width: '100%' }}
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
      />

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn sm" disabled={busy}>{busy ? 'Posting…' : 'Post'}</button>
        {err && <span className="error" role="alert">{err}</span>}
      </div>
    </form>
  );
}

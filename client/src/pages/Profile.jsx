import { useEffect, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import CertificateModal from '../components/CertificateModal.jsx';
import { promptInstall, useInstall, usePush } from '../pwa.js';

// Fully wired against GET/PATCH /api/skeo/me. Personal details (with
// LinkedIn), then "student or working professional?", and only that path's
// questions: a student's UG/PG course and any internship, or a
// professional's company, role and experience. Admins see all of it on the
// student's page.
// Years of work, as ranges: quicker to tap than to type, and comparable.
const EXPERIENCE = ['Under 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years'];

// A row of pick-one buttons.
function Choice({ label, value, onChange, options }) {
  return (
    <div className="pf-choice" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function Profile() {
  const { user, setUser } = useOutletContext();
  const [form, setForm] = useState({
    fullName: user.full_name || '',
    phone: user.phone || '',
    linkedin: user.linkedin || '',
    stage: user.stage || '',
    education: user.education || {},
    professional: user.professional || {},
  });
  const [busy, setBusy] = useState(false);
  // Every certificate this account holds, including ones an admin issued to a
  // whole cohort: the classroom only ever knows about the one you claimed by
  // finishing a programme. A minted-but-unsent certificate is filtered out
  // server side, so this is exactly what the holder is allowed to know about.
  const [certs, setCerts] = useState([]);
  const [openCert, setOpenCert] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { api('/certificates/mine').then((d) => setCerts(d.certificates || [])).catch(() => {}); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const setEdu = (k, v) => setForm((f) => ({ ...f, education: { ...f.education, [k]: v } }));
  const setPro = (k, v) => setForm((f) => ({ ...f, professional: { ...f.professional, [k]: v } }));
  const intern = form.professional.internship || {};
  const setIntern = (k, v) => setForm((f) => ({
    ...f, professional: { ...f.professional, internship: { ...(f.professional.internship || {}), [k]: v } },
  }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const { user: updated } = await api('/me', { method: 'PATCH', body: form });
      setUser(updated);
      setMsg('Saved ✓');
    } catch (e2) {
      setMsg(e2.message);
    } finally {
      setBusy(false);
    }
  }

  // Fields that count toward "profile completeness": the ones this person
  // was actually asked, which depends on whether they are studying or working.
  const fields = [
    form.fullName, form.phone, form.linkedin, form.stage,
    ...(form.stage === 'student' ? [
      form.education.level, form.education.degree, form.education.institution, form.education.year, intern.done,
      ...(intern.done === 'yes' ? [intern.company, intern.role, intern.duration] : []),
    ] : form.stage === 'professional' ? [
      form.professional.company, form.professional.title, form.professional.experience,
    ] : []),
  ];
  const pct = Math.round((fields.filter((v) => String(v || '').trim()).length / fields.length) * 100);

  const name = form.fullName || user.email;

  return (
    <div className="profile-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1>Profile</h1>
          <p>Keep your details current, since certificates use them.</p>
        </div>
      </div>

      <section className="panel profile-hero">
        <div className="profile-hero-id">
          <span className="avatar avatar-xl">{(name || '?')[0].toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className="profile-hero-name">{name}</div>
            <div className="profile-hero-mail">{user.email}</div>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
          </div>
        </div>
        <div className="profile-meter">
          <div className="profile-meter-top">
            <span>Profile completeness</span>
            <span className="profile-meter-pct">{pct}%</span>
          </div>
          <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      </section>

      <form onSubmit={save} className="profile-sections">

      <section className="panel">
        <h3>Personal</h3>
        <div className="field-grid">
          <label>Full name<input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></label>
          <label>Email<input value={user.email} disabled /></label>
          <label>Phone<input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label>LinkedIn profile<input value={form.linkedin} inputMode="url" placeholder="linkedin.com/in/your-name" onChange={(e) => set('linkedin', e.target.value)} /></label>
        </div>
      </section>

      {/* Only when there is something to show. An empty "Certificates" panel on
          the profile of someone mid-programme reads as something withheld. */}
      {certs.length > 0 && (
        <section className="panel">
          <h3>Certificates</h3>
          <div className="cert-list">
            {certs.map((c) => (
              <button type="button" key={c.certId} className="cert-row" onClick={() => setOpenCert(c)}>
                <span>
                  <span className="cert-row-name">{c.programme}</span>
                  <span className="cert-row-meta">{c.certId}{c.batch ? ` · ${c.batch}` : ''}</span>
                </span>
                <span className="cert-row-open">{c.revoked ? 'Revoked' : 'View'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* First: studying or working. Each gets only its own questions. */}
      <section className="panel">
        <h3>Your background</h3>
        <p className="muted pf-ask">Are you a student or a working professional?</p>
        <Choice
          label="Student or working professional"
          value={form.stage}
          onChange={(v) => set('stage', v)}
          options={[['student', 'Student'], ['professional', 'Working professional']]}
        />
      </section>

      {form.stage === 'student' && (
        <>
          <section className="panel">
            <h3>Education</h3>
            <div className="pf-field">
              <span className="pf-label">Level</span>
              <Choice
                label="Level"
                value={form.education.level || ''}
                onChange={(v) => setEdu('level', v)}
                options={[['UG', 'Undergraduate (UG)'], ['PG', 'Postgraduate (PG)']]}
              />
            </div>
            <div className="field-grid">
              <label>Course<input value={form.education.degree || ''} placeholder={form.education.level === 'PG' ? 'e.g. MBA, M.Tech' : 'e.g. B.Tech CSE, BBA'} onChange={(e) => setEdu('degree', e.target.value)} /></label>
              <label>College / University<input value={form.education.institution || ''} onChange={(e) => setEdu('institution', e.target.value)} /></label>
              <label>Year of graduation<input value={form.education.year || ''} inputMode="numeric" placeholder="e.g. 2027" onChange={(e) => setEdu('year', e.target.value)} /></label>
            </div>
          </section>

          <section className="panel">
            <h3>Internship</h3>
            <p className="muted pf-ask">Have you done an internship?</p>
            <Choice
              label="Have you done an internship?"
              value={intern.done || ''}
              onChange={(v) => setIntern('done', v)}
              options={[['yes', 'Yes'], ['no', 'Not yet']]}
            />
            {intern.done === 'yes' && (
              <div className="field-grid pf-follow">
                <label>Company name<input value={intern.company || ''} onChange={(e) => setIntern('company', e.target.value)} /></label>
                <label>Role<input value={intern.role || ''} placeholder="e.g. Marketing intern" onChange={(e) => setIntern('role', e.target.value)} /></label>
                <label>Duration<input value={intern.duration || ''} placeholder="e.g. 3 months (Jun to Aug 2025)" onChange={(e) => setIntern('duration', e.target.value)} /></label>
              </div>
            )}
          </section>
        </>
      )}

      {form.stage === 'professional' && (
        <section className="panel">
          <h3>Work</h3>
          <div className="field-grid">
            <label>Company<input value={form.professional.company || ''} onChange={(e) => setPro('company', e.target.value)} /></label>
            <label>Role<input value={form.professional.title || ''} placeholder="e.g. Product Manager" onChange={(e) => setPro('title', e.target.value)} /></label>
          </div>
          <div className="pf-field pf-follow">
            <span className="pf-label">Experience</span>
            <Choice
              label="Experience"
              value={form.professional.experience || ''}
              onChange={(v) => setPro('experience', v)}
              options={EXPERIENCE.map((x) => [x, x])}
            />
          </div>
        </section>
      )}

      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      </form>

      <ChangePassword />
      <AppSettings />
      {openCert && <CertificateModal cert={openCert} onClose={() => setOpenCert(null)} />}
    </div>
  );
}

// Change-password form: available to every role (used to replace
// the temp password the admin gave them).
function ChangePassword() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // The account menu links straight here (#password): scroll it into view and
  // put the caret in the first field, so the link finishes the job.
  const { hash } = useLocation();
  const ref = useRef(null);
  useEffect(() => {
    if (hash !== '#password' || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.querySelector('input')?.focus({ preventScroll: true });
  }, [hash]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api('/me/password', { method: 'PATCH', body: { currentPassword: cur, newPassword: next } });
      setMsg('Password changed ✓');
      setCur('');
      setNext('');
    } catch (e2) {
      setMsg(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel" id="password" ref={ref}>
      <h3>Change password</h3>
      <div className="field-grid">
        <label>Current password<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></label>
        <label>New password (min 8 characters)<input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required /></label>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </form>
  );
}

// This device: lock-screen notifications and installing the app. Both are per
// device, not per account -- turning notifications on here says nothing about
// the laptop.
const PUSH_COPY = {
  on: 'On for this device. Grades, new work, announcements and replies arrive even with skeo closed.',
  off: 'Get grades, new work, announcements and replies on this device, even with skeo closed.',
  denied: 'Blocked in your browser settings. Allow notifications for this site there, then come back.',
  'needs-install': 'On iPhone and iPad, notifications work once skeo is on your Home Screen.',
  unsupported: 'This browser can’t receive notifications from skeo.',
  unavailable: 'Notifications aren’t switched on for skeo yet.',
};

function AppSettings() {
  const push = usePush();
  const { installed, canInstall } = useInstall();
  if (!push.state) return null;

  return (
    <section className="panel app-settings">
      <h3>This device</h3>

      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Notifications</div>
          <div className="muted">{push.error || PUSH_COPY[push.state]}</div>
        </div>
        {push.state === 'on' && (
          <button type="button" className="btn sm quiet" onClick={push.disable} disabled={push.busy}>{push.busy ? 'Turning off…' : 'Turn off'}</button>
        )}
        {push.state === 'off' && (
          <button type="button" className="btn sm" onClick={push.enable} disabled={push.busy}>{push.busy ? 'Turning on…' : 'Turn on'}</button>
        )}
        {push.state === 'needs-install' && (
          <button type="button" className="btn sm ghost" onClick={promptInstall}>How</button>
        )}
      </div>

      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">skeo app</div>
          <div className="muted">
            {installed
              ? 'You’re using the installed app.'
              : canInstall
                ? 'Install skeo to open it from your home screen, full screen.'
                : 'Use your browser’s menu to install skeo or add it to your home screen.'}
          </div>
        </div>
        {canInstall && <button type="button" className="btn sm" onClick={promptInstall}>Install</button>}
      </div>
    </section>
  );
}

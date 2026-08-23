import { useEffect, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { api, uploadFile, isStoredFile, openStoredFile } from '../api.js';

// Fully wired against GET/PATCH /api/skeo/me. Sections from the spec:
// Personal · Educational · Professional · Resume.
export default function Profile() {
  const { user, setUser } = useOutletContext();
  const [form, setForm] = useState({
    fullName: user.full_name || '',
    phone: user.phone || '',
    education: user.education || {},
    professional: user.professional || {},
    resumeUrl: user.resume_url || '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const resumeFileRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function onResumeFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFileName(file.name);
    setUploading(true);
    setMsg('');
    try { const { url } = await uploadFile(file); set('resumeUrl', url); setMsg('Uploaded ✓ — click Save changes'); }
    catch (e2) { setMsg(e2.message); }
    finally { setUploading(false); }
  }
  async function viewResume() {
    setMsg('');
    try { await openStoredFile(form.resumeUrl); }
    catch (e2) { setMsg(e2.message); }
  }

  const setEdu = (k, v) => setForm((f) => ({ ...f, education: { ...f.education, [k]: v } }));
  const setPro = (k, v) => setForm((f) => ({ ...f, professional: { ...f.professional, [k]: v } }));

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

  // Fields that count toward "profile completeness".
  const fields = [
    form.fullName, form.phone,
    form.education.degree, form.education.institution, form.education.year,
    form.professional.title, form.professional.company, form.professional.experience,
    form.resumeUrl,
  ];
  const pct = Math.round((fields.filter((v) => String(v || '').trim()).length / fields.length) * 100);

  const name = form.fullName || user.email;

  return (
    <div className="profile-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1>Profile</h1>
          <p>Keep your details current — certificates use them.</p>
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
        </div>
      </section>

      <section className="panel">
        <h3>Educational</h3>
        <div className="field-grid">
          <label>Degree<input value={form.education.degree || ''} onChange={(e) => setEdu('degree', e.target.value)} /></label>
          <label>Institution<input value={form.education.institution || ''} onChange={(e) => setEdu('institution', e.target.value)} /></label>
          <label>Year<input value={form.education.year || ''} onChange={(e) => setEdu('year', e.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <h3>Professional</h3>
        <div className="field-grid">
          <label>Title<input value={form.professional.title || ''} onChange={(e) => setPro('title', e.target.value)} /></label>
          <label>Company<input value={form.professional.company || ''} onChange={(e) => setPro('company', e.target.value)} /></label>
          <label>Experience<input value={form.professional.experience || ''} onChange={(e) => setPro('experience', e.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <h3>Resume</h3>
        <div className="field-grid">
          <label>Upload a file (PDF/DOC, ≤ 5 MB)
            <div className="file-picker">
              <input ref={resumeFileRef} type="file" accept=".pdf,.doc,.docx" onChange={onResumeFile} disabled={uploading} hidden />
              <button type="button" className="btn quiet sm" onClick={() => resumeFileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Choose file'}
              </button>
              <span className="muted file-picker-name">{resumeFileName || 'No file chosen'}</span>
            </div>
          </label>
          {/* An uploaded resume is an id, not a link — showing it in the paste
              box would just be noise, and it can't be opened with a bare href. */}
          {isStoredFile(form.resumeUrl) ? (
            <label>Attached file
              <div className="file-picker">
                <button type="button" className="btn quiet sm" onClick={viewResume}>View</button>
                <button type="button" className="btn quiet sm" onClick={() => { set('resumeUrl', ''); setResumeFileName(''); }}>Remove</button>
                <span className="muted file-picker-name">{resumeFileName || 'Uploaded resume'}</span>
              </div>
            </label>
          ) : (
            <label>…or paste a link<input value={form.resumeUrl} onChange={(e) => set('resumeUrl', e.target.value)} placeholder="https://…" /></label>
          )}
        </div>
        {uploading && <p className="muted">Uploading…</p>}
        {form.resumeUrl && !isStoredFile(form.resumeUrl) && (
          <p className="muted"><a href={form.resumeUrl} target="_blank" rel="noreferrer">View current resume →</a></p>
        )}
      </section>

      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      </form>

      <ChangePassword />
    </div>
  );
}

// Change-password form — available to every role (used to replace
// the temp password the admin gave them).
function ChangePassword() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // The account menu links straight here (#password) — scroll it into view and
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

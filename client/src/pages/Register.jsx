import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api.js';
import SkeoWordmark from '../components/SkeoWordmark.jsx';

// Student self-signup. Backend forces role=student; admins are
// provisioned by an admin. On success it returns a token → straight into the app.
export default function Register({ onLogin }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { accessToken, user } = await api('/auth/register', { method: 'POST', body: form });
      setToken(accessToken);
      onLogin(user);
      nav('/app');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-brand"><SkeoWordmark size={30} theme="dark" /></div>
        <div className="auth-hero-copy">
          <h2>Start learning with Skeo.</h2>
          <p>Live sessions, quizzes, projects and feedback — everything in one place.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Create your account</h1>
          <p className="sub">For students joining the Skeo LMS.</p>

          <div className="field">
            <label htmlFor="reg-name">Full name</label>
            <input id="reg-name" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} required aria-describedby={err ? 'reg-error' : undefined} />
          </div>
          <div className="field">
            <label htmlFor="reg-password">Password</label>
            <input id="reg-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} required placeholder="Min 8 characters" aria-describedby={err ? 'reg-error' : undefined} />
          </div>
          {err && <div id="reg-error" className="error auth-error" role="alert">{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account →'}</button>

          <p className="auth-alt">Already have an account? <Link to="/login">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}

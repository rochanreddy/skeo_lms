import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import SkeoWordmark from '../components/SkeoWordmark.jsx';

// The demo accounts, as data — the box below fills the form from these instead
// of asking whoever's driving to retype a password from the screen.
// The admin password here is seed.js's fallback: if SKEO_SEED_PASSWORD is set
// in the server .env, that wins and this row will not open the door.
const DEMOS = [
  { role: 'Admin', email: 'admin@skeo.in', password: 'ChangeMe123!' },
  { role: 'Student', email: 'aarav@demo.skeo.in', password: 'student123' },
];

// Working admin credentials must never render on a public production
// login. Shown in `vite dev`, and on a deliberate demo deployment that opts in
// with VITE_SHOW_DEMOS=true; stripped from an ordinary production build.
const SHOW_DEMOS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMOS === 'true';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { accessToken, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
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
          <h2><span>Build.</span><span>Learn.</span><span>Monetize.</span></h2>
          <p>Master Claude and modern AI tools through hands-on fellowships, real-world projects and career support.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Sign in to Skeo</h1>
          <p className="sub">Welcome back — pick up exactly where you left off.</p>

          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-describedby={err ? 'login-error' : undefined} />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            {/* Reveal toggle — mistyping a password you can't see is the single
                most common reason a sign-in fails twice in a row. */}
            <div className="field-with-action">
              <input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-describedby={err ? 'login-error' : undefined} />
              <button type="button" className="field-action" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
                {show ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.3 3.2" />
                    <path d="M6.2 6.7C4 8.2 3 10.5 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.6-.7" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="2.6" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {err && <div id="login-error" className="error auth-error" role="alert">{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>

          {SHOW_DEMOS && (
            <div className="demo-box">
              <div className="eyebrow">Demo accounts — click to fill</div>
              {DEMOS.map((d) => (
                <button
                  type="button"
                  key={d.email}
                  className="demo-row demo-row-btn"
                  onClick={() => { setEmail(d.email); setPassword(d.password); setErr(''); }}
                >
                  <span>{d.role}</span>
                  <code>{d.email}</code>
                </button>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

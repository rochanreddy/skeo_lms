import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import SkeoWordmark from '../components/SkeoWordmark.jsx';

// Step 1 of password recovery: ask for the reset email.
//
// The server answers /auth/forgot with { ok: true } whether or not the address
// has an account — that is deliberate, it stops this form being used to find
// out who is registered. So the screen says the same thing either way, and must
// not imply the mail is definitely on its way to an account that exists.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (e2) {
      // The only failure that reaches here is the rate limit, which has
      // something real to say ("a link was already sent").
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
          <h2>Locked out?</h2>
          <p>It happens. We&apos;ll email you a link to set a new password — it stays valid for 30 minutes.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        {sent ? (
          <div className="auth-form">
            <h1>Check your email</h1>
            <p className="sub">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 30 minutes.
            </p>
            <p className="sub">Nothing arrived? Check spam, or ask your admin to reset it for you.</p>
            <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <h1>Reset your password</h1>
            <p className="sub">Enter the email you sign in with.</p>

            <div className="field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-describedby={err ? 'forgot-error' : undefined}
              />
            </div>
            {err && <div id="forgot-error" className="error auth-error" role="alert">{err}</div>}
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link →'}</button>

            <p className="auth-alt">Remembered it? <Link to="/login">Sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}

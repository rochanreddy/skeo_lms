import { Link } from 'react-router-dom';
import SkeoWordmark from '../components/SkeoWordmark.jsx';
import GetSkeo from '../components/GetSkeo.jsx';

// There is no self-signup any more. A skeo account is created when a plan is
// bought on skeoai.com — the LMS makes it once the payment is confirmed and
// mails the login — so /signup, which old links and bookmarks still reach, is
// where a newcomer is pointed at the plans instead. The server refuses
// /auth/register for the same reason (routes/auth.js).
export default function Register() {
  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-brand"><SkeoWordmark size={30} theme="dark" /></div>
        <div className="auth-hero-copy">
          <h2>Start learning with skeo.</h2>
          <p>Live sessions, quizzes, projects and feedback — everything in one place.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        <div className="auth-form">
          <h1>Get skeo</h1>
          <p className="sub">Your account is created when you buy a plan, and your login is emailed to you.</p>
          <GetSkeo message="Choose a plan on skeoai.com to get started." />
          <p className="auth-alt">Already bought? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

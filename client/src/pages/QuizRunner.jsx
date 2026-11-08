import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

// A quiz, sat in its own tab: the question on the left, the clock and a map of
// every question on the right. "Take quiz" in Learning opens this.
//
// The clock runs one minute per question and submits on its own at zero.
// Answers, marks and the deadline are kept in this browser as they change, so
// a reload (or a closed tab, reopened) carries on where it was rather than
// starting over with a fresh clock.
const SECONDS_PER_QUESTION = 60;
const draftKey = (id) => `skeo:quiz-draft:${id}`;

function readDraft(id) {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; }
}
function writeDraft(id, draft) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(draft)); } catch { /* private mode: no resume */ }
}
function clearDraft(id) {
  try { localStorage.removeItem(draftKey(id)); } catch { /* nothing to clear */ }
}

// Drawn arrows, not the ← → characters, which sit off the text's centre line
// and change shape from font to font.
const Chevron = ({ dir }) => (
  <svg className="qz-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
  </svg>
);
const Arrow = ({ dir }) => (
  <svg className="qz-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'} />
  </svg>
);

const Star = ({ filled }) => (
  <svg className="qz-ic" width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9z" />
  </svg>
);

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function QuizRunner() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { score, total }
  const [answers, setAnswers] = useState({}); // index -> option index
  const [marked, setMarked] = useState({}); // index -> true
  const [current, setCurrent] = useState(0);
  const [deadline, setDeadline] = useState(null); // ms epoch
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submitted = useRef(false);

  // ── Load the quiz, and pick up a draft if there is one ──
  useEffect(() => {
    api(`/quizzes/${id}`)
      .then(({ quiz: q, myAttempt }) => {
        document.title = `${q.title} · skeo`;
        setQuiz(q);
        if (myAttempt) { setResult({ score: myAttempt.score, total: myAttempt.total, already: true }); clearDraft(id); return; }
        const d = readDraft(id);
        if (d?.deadline) {
          setAnswers(d.answers || {}); setMarked(d.marked || {}); setCurrent(d.current || 0); setDeadline(d.deadline);
        } else {
          setDeadline(Date.now() + q.questions.length * SECONDS_PER_QUESTION * 1000);
        }
      })
      .catch((err) => setError(err.message || 'This quiz could not be opened.'));
  }, [id]);

  // Keep the draft current.
  useEffect(() => {
    if (quiz && deadline && !result) writeDraft(id, { answers, marked, current, deadline });
  }, [answers, marked, current, deadline, quiz, result, id]);

  const total = quiz?.questions.length || 0;
  const answeredCount = Object.keys(answers).length;
  const markedCount = Object.keys(marked).filter((k) => marked[k]).length;
  const left = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : 0;

  const submit = useCallback(async () => {
    if (submitted.current || !quiz) return;
    submitted.current = true;
    setBusy(true); setConfirming(false);
    try {
      const ordered = quiz.questions.map((_, i) => (answers[i] ?? -1));
      const { attempt } = await api(`/quizzes/${quiz._id}/attempt`, { method: 'POST', body: { answers: ordered } });
      clearDraft(id);
      setResult({ score: attempt.score, total: attempt.total });
      // The Learning tab that opened this refreshes its list.
      try { window.opener?.postMessage({ type: 'skeo-quiz-done', id }, window.location.origin); } catch { /* opener gone */ }
    } catch (err) {
      submitted.current = false;
      setError(err.message || 'Could not submit. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [quiz, answers, id]);

  // ── The clock ──
  useEffect(() => {
    if (!deadline || result) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline, result]);
  useEffect(() => {
    if (deadline && !result && quiz && left === 0) submit();
  }, [left, deadline, result, quiz, submit]);

  // Leaving mid-quiz asks first. (The draft survives either way.)
  useEffect(() => {
    if (!quiz || result) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [quiz, result]);

  const choose = (oi) => setAnswers((a) => ({ ...a, [current]: oi }));
  const clear = () => setAnswers((a) => { const n = { ...a }; delete n[current]; return n; });
  const toggleMark = () => setMarked((m) => ({ ...m, [current]: !m[current] }));
  const go = (i) => setCurrent(Math.min(total - 1, Math.max(0, i)));

  // ── Keys: 1-9 choose, Enter next, arrows move ──
  useEffect(() => {
    if (!quiz || result) return undefined;
    const onKey = (e) => {
      if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const q = quiz.questions[current];
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) { e.preventDefault(); choose(n - 1); }
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (current < total - 1) go(current + 1); else setConfirming(true); }
      else if (e.key === 'ArrowRight') go(current + 1);
      else if (e.key === 'ArrowLeft') go(current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exit = () => {
    if (window.opener) window.close();
    else window.location.assign('/app/learning?tab=quizzes');
  };

  if (error && !quiz) {
    return (
      <div className="qz-shell">
        <div className="qz-card qz-end">
          <h1>Quiz unavailable</h1>
          <p className="muted">{error}</p>
          <button className="btn" onClick={exit}>Back to Learning</button>
        </div>
      </div>
    );
  }
  if (!quiz) return <div className="qz-shell"><div className="qz-card qz-loading"><div className="skeleton" style={{ height: 300, borderRadius: 16 }} /></div></div>;

  if (result) {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <div className="qz-shell">
        <div className="qz-card qz-end">
          <div className="qz-eyebrow">{quiz.title}</div>
          <div className="qz-score">{pct}<span>%</span></div>
          <p className="qz-score-sub">{result.score} of {result.total} correct</p>
          <p className="muted">{result.already ? 'You have already sat this quiz.' : 'Submitted. Review your answers from the Quizzes tab in Learning.'}</p>
          <button className="btn" onClick={exit}>Back to Learning</button>
        </div>
      </div>
    );
  }

  const q = quiz.questions[current];
  const statusOf = (i) => (marked[i] ? 'marked' : answers[i] != null ? 'answered' : 'left');
  const lowTime = left <= 60;

  return (
    <div className="qz-shell">
      <main className="qz-card qz-main">
        <div className="qz-top">
          <button type="button" className="qz-exit" onClick={exit}><Arrow dir="left" /> Exit</button>
          <div className="qz-eyebrow" title={quiz.title}>{quiz.title}</div>
        </div>
        <div className="qz-progress" aria-hidden="true"><span style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} /></div>

        <div className="qz-count">Question {current + 1} of {total} · {answeredCount} answered</div>
        <h1 className="qz-question">{q.text}</h1>

        <div className="qz-options" role="radiogroup" aria-label={`Question ${current + 1}`}>
          {q.options.map((o, oi) => (
            <button
              key={oi}
              type="button"
              role="radio"
              aria-checked={answers[current] === oi}
              className={`qz-option ${answers[current] === oi ? 'on' : ''}`}
              onClick={() => choose(oi)}
            >
              <span className="qz-key">{oi + 1}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>

        <div className="qz-foot">
          <div className="qz-tools">
            <button type="button" className="qz-tool" disabled={current === 0} onClick={() => go(current - 1)}><Chevron dir="left" /> Prev</button>
            <button type="button" className="qz-tool qz-tool-pill" disabled={answers[current] == null} onClick={clear}>Clear</button>
            <button type="button" className={`qz-tool qz-tool-pill ${marked[current] ? 'on' : ''}`} onClick={toggleMark} aria-pressed={!!marked[current]}>
              <Star filled={!!marked[current]} /> {marked[current] ? 'Marked' : 'Mark'}
            </button>
          </div>
          {current < total - 1 ? (
            <button type="button" className="btn qz-next" onClick={() => go(current + 1)}>Next <Chevron dir="right" /></button>
          ) : (
            <button type="button" className="btn qz-next" onClick={() => setConfirming(true)}>Finish <Chevron dir="right" /></button>
          )}
        </div>
        <p className="qz-tip">Press <kbd>1</kbd>–<kbd>{q.options.length}</kbd> to choose, <kbd>Enter</kbd> for next.</p>
      </main>

      <aside className="qz-card qz-side">
        <div className={`qz-timer ${lowTime ? 'is-low' : ''}`} role="timer" aria-live={lowTime ? 'polite' : 'off'}>
          <span>Time left</span>
          <strong>{mmss(left)}</strong>
        </div>

        <div className="qz-side-label">Questions</div>
        <div className="qz-grid">
          {quiz.questions.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`qz-cell is-${statusOf(i)} ${i === current ? 'is-current' : ''}`}
              onClick={() => go(i)}
              aria-label={`Question ${i + 1}, ${statusOf(i)}`}
              aria-current={i === current ? 'true' : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <ul className="qz-legend">
          <li><span className="qz-dot is-answered" />Answered · {answeredCount}</li>
          <li><span className="qz-dot is-marked" />Marked · {markedCount}</li>
          <li><span className="qz-dot is-left" />Left · {total - answeredCount}</li>
        </ul>

        {error && <p className="qz-error" role="alert">{error}</p>}
        <button type="button" className="btn qz-submit" disabled={busy} onClick={() => setConfirming(true)}>
          {busy ? 'Submitting…' : 'Submit Test'}
        </button>
        <p className="qz-note">Answers save as you go. Mark any question to revisit it before you submit.</p>
      </aside>

      {confirming && (
        <div className="qz-confirm-back" role="presentation" onClick={() => setConfirming(false)}>
          <div className="qz-card qz-confirm" role="dialog" aria-modal="true" aria-labelledby="qz-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="qz-confirm-title">Submit the test?</h2>
            <p className="muted">
              {answeredCount} of {total} answered
              {total - answeredCount > 0 && <>; {total - answeredCount} left blank will count as wrong</>}.
              You can't change answers after submitting.
            </p>
            <div className="qz-confirm-btns">
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)} autoFocus>Keep going</button>
              <button type="button" className="btn qz-submit" onClick={submit} disabled={busy}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

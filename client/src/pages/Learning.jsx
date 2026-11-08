import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FileViewer from '../components/FileViewer.jsx';
import Markdown from '../components/Markdown.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import LineIcon from '../components/LineIcon.jsx';
import VdoPlayer from '../components/VdoPlayer.jsx';
import { CheckBadge, SubmissionCheckPanel } from '../components/SubmissionCheck.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { createVideoClock } from '../lib/videoClock.js';
import { formatTime } from '../lib/player.js';
import { mediaOf, mediaFrom, stripParentContext, lessonWords, readLastLesson, writeLastLesson } from '../lib/syllabus.js';
import CertificateModal from '../components/CertificateModal.jsx';
import StudentGrades from './StudentGrades.jsx';

// The student tabs, as ?tab= spells them.
const TABS = ['content', 'assignments', 'quizzes', 'grades'];

// The one-column phone layout, where the list sits under the player.
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;

// How long a reading lesson has to be open before it counts as done.
const READ_COUNTS_AFTER_MS = 4000;

// Learning. For students: Content + Projects (submit) + Quizzes (take) +
// Grades (what came back). Grades used to be its own tab in the navbar.
// For admins: just the course content to teach from, they create &
// grade assignments/quizzes under Course, not here.
export default function Learning() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // ?tab= lets search results (and shared links) open straight onto the right
  // tab: "assignments" hits from ⌘K would otherwise land on Content.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = params.get('tab');
    return TABS.includes(t) ? t : 'content';
  });

  // …and keeps working when a result is opened while already on this page.
  const wantTab = params.get('tab');
  const wantTopic = params.get('topic');
  useEffect(() => {
    if (wantTab && TABS.includes(wantTab)) setTab(wantTab);
    else if (wantTopic) setTab('content');
  }, [wantTab, wantTopic]);

  if (!isStudent) {
    return (
      <div className="learning-page">
        <h1>Learning</h1>
        <p className="muted">The course content your students see. Teach from this. Create &amp; grade projects and quizzes under <b>Course</b>.</p>
        <Content />
      </div>
    );
  }

  return (
    <div className="learning-page">
      <h1>Learning</h1>
      <div className="tabs">
        <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Content</button>
        <button className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Projects</button>
        <button className={`tab ${tab === 'quizzes' ? 'active' : ''}`} onClick={() => setTab('quizzes')}>Quizzes</button>
        <button className={`tab ${tab === 'grades' ? 'active' : ''}`} onClick={() => setTab('grades')}>Grades</button>
      </div>
      {tab === 'content' && <Content />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'quizzes' && <Quizzes />}
      {tab === 'grades' && <StudentGrades embedded />}
    </div>
  );
}

// Every quiz in one place. The module gates come first, in module order, and
// unlock one at a time: gate N opens only once gate N-1 has been attempted,
// the same rule that unlocks the modules themselves over on Content.
function Quizzes() {
  const [gates, setGates] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [pd, bq] = await Promise.all([
      api('/programs').catch(() => ({ programs: [] })),
      api('/quizzes?scope=mine').catch(() => ({ quizzes: [] })),
    ]);
    setOthers(bq.quizzes || []);

    const p = (pd.programs || [])[0];
    if (p) {
      // Module order lives on the programme, not the quiz, so fetch the tree
      // when the list didn't already carry it. The gate quizzes only need the
      // programme *id*, which we already have, so they go out alongside the
      // tree rather than waiting a round trip behind it.
      const [full, gq] = await Promise.all([
        p.modules?.length ? p : api(`/programs/${p._id}`).then((d) => d.program).catch(() => p),
        api(`/quizzes?programId=${p._id}`).then((d) => d.quizzes || []).catch(() => []),
      ]);
      const order = new Map((full.modules || []).map((m, i) => [String(m._id), i]));
      setGates(gq
        .map((q) => ({ ...q, modIndex: order.has(String(q.moduleId)) ? order.get(String(q.moduleId)) : 1e6 }))
        .sort((a, b) => a.modIndex - b.modIndex));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  // A quiz is sat in its own tab; when it reports back, or this tab comes
  // back into view, the scores and the unlocked gates are refreshed.
  useEffect(() => {
    const onMessage = (e) => { if (e.origin === window.location.origin && e.data?.type === 'skeo-quiz-done') load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('message', onMessage); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // How many gates are reachable: every one up to and including the first
  // unattempted. Attempting it opens the next.
  let open = 0;
  for (const g of gates) { open += 1; if (!g.myAttempt) break; }

  if (loading) return <p className="muted">Loading quizzes…</p>;
  if (gates.length === 0 && others.length === 0) {
    return <p className="muted">No quizzes yet. They appear here once posted.</p>;
  }

  return (
    <div>
      {gates.length > 0 && (
        <>
          <h3 className="ruled-head">Module quizzes</h3>
          <p className="muted" style={{ margin: '-8px 0 16px' }}>
            Attempt each one to unlock the next module, and the next quiz.
          </p>
          <div className="list">
            {gates.map((q, i) => (i < open ? (
              <QuizCard key={q._id} quiz={q} />
            ) : (
              <div key={q._id} className="panel quiz-locked">
                <div className="row">
                  <LineIcon name="key" size={16} />
                  <strong>{q.title}</strong>
                  <span className="badge badge-muted">Locked</span>
                </div>
                <p className="muted" style={{ margin: '8px 0 0' }}>
                  Attempt the Module {i} quiz to open this one.
                </p>
              </div>
            )))}
          </div>
        </>
      )}

      {others.length > 0 && (
        <>
          <h3 className="ruled-head" style={{ marginTop: gates.length ? 34 : 0 }}>Other quizzes</h3>
          <div className="list">
            {others.map((q) => <QuizCard key={q._id} quiz={q} />)}
          </div>
        </>
      )}
    </div>
  );
}

function QuizCard({ quiz }) {
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const attempt = quiz.myAttempt;
  const total = quiz.questions.length;

  // Fetched once, then toggled, the review never changes after an attempt.
  async function toggleReview() {
    if (review) { setShowReview((v) => !v); return; }
    setBusy(true);
    try {
      setReview(await api(`/quizzes/${quiz._id}/review`));
      setShowReview(true);
    } finally { setBusy(false); }
  }

  const pct = attempt && attempt.total ? Math.round((attempt.score / attempt.total) * 100) : null;

  return (
    <div className="panel quiz-card">
      {/* Title and what it is on the left; the one thing to do on the right. */}
      <div className="quiz-card-head">
        <div className="quiz-card-text">
          <strong className="quiz-card-title">{quiz.title}</strong>
          <span className="quiz-card-meta">
            {total} question{total === 1 ? '' : 's'} · {total} min
            {quiz.type && quiz.type !== 'quiz' && <> · {quiz.type}</>}
            {attempt && <> · <span className="quiz-card-scored">Scored {attempt.score}/{attempt.total}</span></>}
          </span>
        </div>
        {/* The quiz opens in its own tab, timed, with nothing else around it. */}
        {!attempt && (
          <a className="btn quiz-card-go" href={`/quiz/${quiz._id}`} target="_blank" rel="opener">Take quiz →</a>
        )}
      </div>
      {attempt && (
        <div className="quiz-review-bar">
          <div className="qr-score">
            <span className="qr-score-pct">{pct}%</span>
            <span className="muted">{attempt.score} of {attempt.total} correct</span>
          </div>
          <button className="btn sm ghost" onClick={toggleReview} disabled={busy}>
            {busy ? 'Loading…' : showReview ? 'Hide review' : 'Review answers'}
          </button>
        </div>
      )}
      {showReview && review && <QuizReview questions={review.questions} />}
    </div>
  );
}

function QuizStepper({ count, current, onSelect, statusFor }) {
  return (
    <div className="quiz-stepper" role="tablist" aria-label="Questions">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === current}
          className={`quiz-step ${statusFor(i)} ${i === current ? 'current' : ''}`}
          onClick={() => onSelect(i)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

// Post-attempt feedback: every question with the student's pick, the right
// answer, and the author's explanation. This is where the quiz actually
// teaches: shown one question at a time via the stepper above it.
function QuizReview({ questions }) {
  const [qIndex, setQIndex] = useState(0);
  const total = questions.length;
  const q = questions[qIndex];

  return (
    <div className="quiz-review">
      <QuizStepper
        count={total}
        current={qIndex}
        onSelect={setQIndex}
        statusFor={(i) => (questions[i].isCorrect ? 'correct' : 'incorrect')}
      />

      <div className={`qr-q ${q.isCorrect ? 'ok' : 'bad'}`}>
        <div className="qr-q-head">
          <span className={`qr-mark ${q.isCorrect ? 'ok' : 'bad'}`}>{q.isCorrect ? '✓' : '✗'}</span>
          <div>
            <div className="qr-q-count">Question {qIndex + 1} of {total}</div>
            <strong>{q.text}</strong>
          </div>
        </div>

        <div className="qr-opts">
          {q.options.map((o, oi) => {
            const isCorrect = oi === q.correctIndex;
            const isMine = oi === q.myAnswer;
            return (
              <div key={oi} className={`qr-opt ${isCorrect ? 'correct' : isMine ? 'wrong' : ''}`}>
                <span>{o}</span>
                {isCorrect && <span className="qr-tag tag-correct">{isMine ? 'Your answer · correct' : 'Correct answer'}</span>}
                {isMine && !isCorrect && <span className="qr-tag tag-wrong">Your answer</span>}
              </div>
            );
          })}
        </div>

        {q.myAnswer === null && <p className="muted qr-blank">You left this one blank.</p>}

        {q.explanation && (
          <div className="qr-why">
            <div className="qr-why-label">Why</div>
            <Markdown text={q.explanation} />
          </div>
        )}
      </div>

      <div className="quiz-take-nav">
        <button type="button" className="btn ghost sm" disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>← Previous</button>
        <button type="button" className="btn ghost sm" disabled={qIndex === total - 1} onClick={() => setQIndex((i) => i + 1)}>Next →</button>
      </div>
    </div>
  );
}

// ── Resources ─────────────────────────────────────────────────────────────
// The files attached to a lesson (or gathered from a page's lessons), as a row
// of chips under the title. Only what exists is shown: an empty slot is not
// something a student can act on, so it has no business taking a chip.
function ChipRow({ media, subtitle, onOpen }) {
  const chips = [
    { key: 'pdf', type: 'pdf', label: 'Open the PDF', url: media.pdf },
    { key: 'notes', type: 'text', label: 'Notes', url: media.notes },
    { key: 'klass', type: 'video', label: 'Class link', url: media.klass, external: true },
  ].filter((c) => c.url);
  if (chips.length === 0) return null;
  return (
    <div className="cp-res">
      {chips.map((c) => (c.external ? (
        <a key={c.key} className="cp-chip" href={c.url} target="_blank" rel="noreferrer">
          <LessonIcon type={c.type} size={15} /> {c.label}
        </a>
      ) : (
        <button key={c.key} type="button" className="cp-chip" onClick={() => onOpen({ label: c.label, subtitle, url: c.url })}>
          <LessonIcon type={c.type} size={15} /> {c.label}
        </button>
      )))}
    </div>
  );
}

function Content() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // The lesson you're on lives in the URL, so a lesson is a shareable link and
  // ⌘K can drop you straight into one instead of onto the page that holds it.
  const [params, setParams] = useSearchParams();
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topicId, setTopicId] = useState(null);
  // The page currently on the reader, if any. One piece of state for both
  // levels, resolved through a memo below into everything the reader needs.
  // It never enters the URL, a deep link still names a lesson.
  const [pageRef, setPageRef] = useState(null); // { kind: 'module'|'chapter', id }
  const [open, setOpen] = useState({});
  // Only one chapter is unfolded at a time, so a module's chapters all stay on
  // screen instead of the accordion pushing the scrolling one level down.
  const [openChap, setOpenChap] = useState(null);
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  // Phones: under the player, "About" (the lesson text) and "Lessons" (the
  // list) share one spot, switched by a segmented control. Desktop ignores it.
  const [mobileTab, setMobileTab] = useState('lessons');
  // Progress and gates arrive after the tree. The first lesson is chosen only
  // once both are in, or it could pick one that is finished or locked.
  const [progressReady, setProgressReady] = useState(false);
  const [gatesReady, setGatesReady] = useState(false);
  const autoPicked = useRef(null); // programme id already auto-opened
  const [cert, setCert] = useState(null);
  const [viewer, setViewer] = useState(null); // { label, subtitle, url }
  // Gate quizzes, one per module. Attempting a module's quiz unlocks the next.
  const [gates, setGates] = useState([]);       // [{ _id, moduleId, myAttempt, … }]

  const loadGates = (programId) => api(`/quizzes?programId=${programId}`)
    .then((d) => setGates(d.quizzes || []))
    .catch(() => setGates([]))
    .finally(() => setGatesReady(true));

  const gateFor = (modId) => gates.find((q) => String(q.moduleId) === String(modId)) || null;

  // A module is open if every module before it has had its gate quiz attempted.
  // Admins see everything; so does anyone on a programme with no gates set up.
  const unlockedCount = useMemo(() => {
    const mods = program?.modules || [];
    if (!isStudent) return mods.length;
    let n = 0;
    for (const m of mods) {
      n += 1;                                   // this one is reachable
      const g = gateFor(m._id);
      if (g && !g.myAttempt) break;             // its gate stops the rest
    }
    return n;
  }, [program, gates, isStudent]);
  const isLocked = (mi) => mi >= unlockedCount;

  // Flatten the tree into an ordered lesson list for counting + prev/next.
  const flat = useMemo(() => {
    const arr = [];
    (program?.modules || []).forEach((m) => (m.chapters || []).forEach((c) => (c.topics || []).forEach((t) => arr.push({ topic: t, modId: m._id, chapId: c._id, mod: m.title, chap: c.title }))));
    return arr;
  }, [program]);
  const idx = flat.findIndex((f) => f.topic._id === topicId);
  const current = idx >= 0 ? flat[idx] : null;
  const topic = current?.topic || null;

  // Everything a page needs, resolved from pageRef in one place. Null whenever
  // nothing is open, the reference no longer points at anything (a programme
  // switch, a module an admin removed), or the target carries no page text,
  // so a curriculum without pages simply never reaches this state.
  const page = useMemo(() => {
    if (!pageRef || !program) return null;
    const mods = program.modules || [];
    if (pageRef.kind === 'module') {
      const mi = mods.findIndex((m) => String(m._id) === String(pageRef.id));
      const m = mods[mi];
      if (!m?.description) return null;
      const topics = (m.chapters || []).flatMap((c) => c.topics || []);
      return {
        crumb: m.title,
        title: 'Week overview',
        position: `Week ${mi + 1} of ${mods.length}`,
        body: m.description,
        media: mediaFrom(topics),
        startLabel: 'Start week',
        firstTopicId: topics[0]?._id || null,
      };
    }
    for (let mi = 0; mi < mods.length; mi += 1) {
      const chaps = mods[mi].chapters || [];
      const ci = chaps.findIndex((c) => String(c._id) === String(pageRef.id));
      if (ci < 0) continue;
      const c = chaps[ci];
      if (!c.description) return null;
      const topics = c.topics || [];
      return {
        crumb: `${mods[mi].title} · ${c.title}`,
        title: c.pageLabel || 'Overview',
        position: `Chapter ${ci + 1} of ${chaps.length}`,
        body: c.description,
        media: mediaFrom(topics),
        startLabel: 'Start session',
        firstTopicId: topics[0]?._id || null,
      };
    }
    return null;
  }, [pageRef, program]);

  // Where the thing you're reading about begins, in the flattened lesson list:
  // Next starts it, Previous goes to the lesson immediately before it began.
  const pageStart = page?.firstTopicId
    ? flat.findIndex((f) => String(f.topic._id) === String(page.firstTopicId))
    : -1;

  // Which module (by index) a flattened lesson belongs to, for lock checks.
  const modIndexOf = (modId) => (program?.modules || []).findIndex((m) => String(m._id) === String(modId));

  // What "Continue learning" offers when nothing is open: the lesson last
  // opened here, unless it has since been completed, then the first unfinished
  // lesson after it. Never a lesson behind a gate. When everything is done, the
  // last lesson opened (or the first) is offered again to revisit.
  const resume = useMemo(() => {
    if (!program || flat.length === 0) return null;
    const reachable = (f) => !isLocked(modIndexOf(f.modId));
    const lastId = readLastLesson(program._id);
    const lastIdx = lastId ? flat.findIndex((f) => String(f.topic._id) === String(lastId)) : -1;
    const last = lastIdx >= 0 ? flat[lastIdx] : null;
    if (last && reachable(last) && !completed.has(last.topic._id)) return { f: last, idx: lastIdx, kind: 'resume' };
    const after = flat.slice(lastIdx + 1).findIndex((f) => !completed.has(f.topic._id) && reachable(f));
    const firstIdx = after >= 0 ? lastIdx + 1 + after : flat.findIndex((f) => !completed.has(f.topic._id) && reachable(f));
    if (firstIdx >= 0) return { f: flat[firstIdx], idx: firstIdx, kind: completed.size || last ? 'continue' : 'start' };
    const back = last && reachable(last) ? lastIdx : 0;
    return { f: flat[back], idx: back, kind: 'revisit' };
  }, [program, flat, completed, unlockedCount, topicId]);

  // The module holding whatever is open, for the list's "current" mark.
  const currentModId = topic ? current.modId
    : pageRef?.kind === 'module' ? pageRef.id
    : pageRef?.kind === 'chapter' ? ((program?.modules || []).find((m) => (m.chapters || []).some((c) => String(c._id) === String(pageRef.id)))?._id ?? null)
    : null;

  // The next gate a student still has to sit: the newest open module's quiz,
  // when it hasn't been attempted. (A gate behind a lock isn't "pending" yet.)
  const pendingGate = useMemo(() => {
    if (!isStudent) return null;
    return gates.find((g) => !g.myAttempt && modIndexOf(g.moduleId) >= 0 && modIndexOf(g.moduleId) < unlockedCount) || null;
  }, [gates, unlockedCount, program, isStudent]);

  const loadProgress = (programId) => {
    if (!isStudent || !programId) { setProgressReady(true); return; }
    api(`/progress/me?programId=${programId}`)
      .then((d) => { setCompleted(new Set(d.completedTopics)); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setProgressReady(true));
  };
  // Locate a topic anywhere in a program's tree, so a deep link can open the
  // right module + chapter as well as the right lesson.
  function locate(p, tid) {
    for (const m of p.modules || []) {
      for (const c of m.chapters || []) {
        for (const t of c.topics || []) if (String(t._id) === String(tid)) return { topic: t, modId: m._id, chapId: c._id };
      }
    }
    return null;
  }

  async function pick(id, preferTopicId) {
    // Progress and the gate quizzes are keyed on the programme id alone, which
    // we already hold: starting them here rather than after the tree arrives
    // takes a round trip off the critical path for the whole screen.
    setProgressReady(false); setGatesReady(false);
    loadProgress(id);
    loadGates(id);
    const { program: p } = await api(`/programs/${id}`);
    setProgram(p); setCert(null); setPageRef(null);
    const target = preferTopicId ? locate(p, preferTopicId) : null;
    if (target) {
      // A deep link unfolds the module and the chapter that hold its lesson.
      setOpen({ [target.modId]: true });
      setOpenChap(String(target.chapId));
      setTopicId(target.topic._id);
    } else {
      // Nothing chosen yet: the effect below opens the lesson to continue from
      // as soon as progress and the gates are known.
      setOpen({}); setOpenChap(null); setTopicId(null);
    }
  }

  // Arriving at Learning should land on the lesson you'd continue from, with
  // the player ready: not on an empty reader and a list to hunt through.
  // Once per programme: closing a page afterwards must not re-open a lesson.
  useEffect(() => {
    if (!program || !progressReady || !gatesReady || topicId || pageRef) return;
    if (autoPicked.current === program._id) return;
    autoPicked.current = program._id;
    if (resume) selectTopic(resume.f, { quiet: true });
  }, [program, progressReady, gatesReady, resume]);

  // Showing a page clears the lesson, and takes ?topic= with it: a page is not
  // addressable, so leaving a stale lesson id in the URL would make Back and a
  // copied link disagree with what's on screen.
  function showPage(ref) {
    setPageRef(ref);
    setTopicId(null);
    setMobileTab('about');
    if (program) setParams({ program: program._id }, { replace: true });
  }

  // All lessons, on a phone: every module folded, an outline to pick from.
  // The video is hidden there, so it is paused too: a hidden player would
  // otherwise keep talking.
  function showAllLessons() {
    if (mobileTab !== 'lessons') { setOpen({}); setOpenChap(null); }
    setMobileTab('lessons');
    clock.pause();
  }

  // Pressing a module opens it and shows its page. Pressing the one already
  // open, while its page is showing, folds it away and returns the reader to
  // the landing state.
  function pressModule(m) {
    const id = String(m._id);
    // Phones, in the All lessons view: a module is a plain dropdown. Opening
    // its overview page would swap the view and take the lesson off screen.
    if (isPhone()) {
      setOpen((o) => ({ ...o, [id]: !o[id] }));
      setOpenChap(null);
      return;
    }
    const showingPage = pageRef?.kind === 'module' && String(pageRef.id) === id;
    // Fold it away when pressing the module that's already open while its page
    // is showing: or, for a module that has no page, on any second press,
    // which is the plain accordion it was before pages existed.
    if (open[id] && (showingPage || !m.description)) {
      setOpen((o) => ({ ...o, [id]: false }));
      setOpenChap(null);
      if (showingPage) setPageRef(null);
      return;
    }
    setOpen((o) => ({ ...o, [id]: true }));
    setOpenChap(null); // opening a module folds any chapter unfolded inside it
    if (m.description) showPage({ kind: 'module', id });
  }

  // The week strip always *opens*, a card isn't a toggle, and on a phone,
  // where the syllabus sits below the reader, brings the module into view.
  function openModule(m, mi) {
    if (isLocked(mi)) return;
    const id = String(m._id);
    setOpen((o) => ({ ...o, [id]: true }));
    setOpenChap(null);
    if (m.description) showPage({ kind: 'module', id });
    setMobileTab('lessons');
  }

  // Unfolding a chapter must NOT touch the reader. You open a week to read its
  // overview; looking at what a session contains shouldn't take that away
  // before you've chosen anything inside it.
  const pressChapter = (c) =>
    setOpenChap((cur) => (String(cur) === String(c._id) ? null : String(c._id)));

  function selectTopic(f, { quiet = false } = {}) {
    setTopicId(f.topic._id);
    setPageRef(null);
    setOpen((o) => ({ ...o, [f.modId]: true }));
    setOpenChap(String(f.chapId));
    // replace, not push, Prev/Next shouldn't fill the back button with lessons.
    if (program) setParams({ program: program._id, topic: String(f.topic._id) }, { replace: true });
    // Remembered per programme, so the landing card can offer to pick up here.
    if (program) writeLastLesson(program._id, f.topic._id);
    // Phones: a lesson with text opens on About; a video-only one keeps the
    // list under the player. Either way the player comes to the top, except
    // on arrival, when the page is already at the top and must stay there.
    setMobileTab('about');
    if (!quiet && isPhone()) {
      requestAnimationFrame(() => document.querySelector('.cp-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  // Keep the open lesson in view in the list as Previous/Next move through it.
  useEffect(() => {
    document.querySelector('.cp-list .cur-topic.active')?.scrollIntoView({ block: 'nearest' });
  }, [topicId]);

  useEffect(() => {
    // Students only see the program(s) of the batches they're enrolled in.
    Promise.all([api('/programs'), isStudent ? api('/batches') : Promise.resolve({ batches: null })])
      .then(([pd, bd]) => {
        let list = pd.programs || [];
        if (bd.batches) {
          // Students see only published programs of the batches they're enrolled in.
          const mine = new Set(bd.batches.map((b) => b.programId).filter(Boolean));
          list = list.filter((p) => mine.has(p._id) && p.published);
        }
        setPrograms(list);
        // Honour a deep link (?program=&topic=) on first load; otherwise open
        // the first programme as before.
        const wantP = params.get('program');
        const start = (wantP && list.find((p) => p._id === wantP)) ? wantP : list[0]?._id;
        if (start) pick(start, params.get('topic'));
      })
      .catch(() => {});
  }, []);

  // A search result opened while already on this page only changes the URL,
  // react to that too, or ⌘K would appear to do nothing the second time.
  const urlProgram = params.get('program');
  const urlTopic = params.get('topic');
  useEffect(() => {
    if (!urlTopic || !program) return;
    if (String(urlTopic) === String(topicId)) return;
    if (urlProgram && urlProgram !== program._id) { pick(urlProgram, urlTopic); return; }
    const target = locate(program, urlTopic);
    if (target) {
      setTopicId(target.topic._id);
      setPageRef(null);
      setOpen((o) => ({ ...o, [target.modId]: true }));
      setOpenChap(String(target.chapId));
    }
  }, [urlProgram, urlTopic]);

  // Lessons complete themselves: a video once most of it has played, any
  // other lesson once it has been open for a moment. There is no button.
  const completedRef = useRef(completed);
  completedRef.current = completed;
  async function markDone(tid) {
    if (!isStudent || !program || completedRef.current.has(tid)) return;
    try {
      const { completedTopics } = await api('/progress/complete', { method: 'POST', body: { programId: program._id, topicId: tid } });
      setCompleted(new Set(completedTopics));
    } catch { /* the next visit will try again */ }
  }
  // A reading lesson counts once it has been open a few seconds, long enough
  // that paging past it with Next doesn't tick it off. A video lesson waits
  // for the player; one whose recording isn't published yet waits for that.
  useEffect(() => {
    if (!topic || !isStudent || topic.contentType === 'video') return undefined;
    const t = setTimeout(() => markDone(topic._id), READ_COUNTS_AFTER_MS);
    return () => clearTimeout(t);
  }, [topic?._id, isStudent, program?._id]);

  // The open video's time, shared with the timeline between ◀ and ▶.
  const clock = useMemo(() => createVideoClock(), [topic?._id]);
  async function viewCertificate() {
    const c = await api(`/progress/certificate?programId=${program._id}`);
    if (c.eligible) setCert(c);
  }

  const done = Math.min(completed.size, total);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isDone = topic && completed.has(topic._id);
  // What follows this lesson, the next one in order, unless it sits behind
  // this module's gate, in which case the gate is what's next.
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  const nextLocked = !!next && isLocked(modIndexOf(next.modId));
  // A DRM lesson wins over every plain URL on the topic: if the admin put the
  // recording in VdoCipher, that is where it is watched.
  const vdoId = topic?.contentType === 'video' ? (topic.vdoVideoId || '') : '';
  // A video lesson always has the player box; without a recording yet it
  // holds the "on its way" card rather than disappearing.

  const reading = !!(topic || page);
  const hasVideo = topic?.contentType === 'video';
  const bodyText = topic ? (topic.body || '') : page ? (page.body || '') : '';
  const hasAbout = !!bodyText;
  // Phones, on "All lessons": only the module list shows.
  const lessonsView = reading && mobileTab === 'lessons';
  const crumb = topic
    ? `${current.mod}${current.chap && current.chap !== 'Lessons' ? ` · ${stripParentContext(current.chap, current.mod)}` : ''}`
    : page?.crumb || '';
  const position = topic ? `Lesson ${idx + 1} of ${flat.length}` : page?.position || '';
  const weeks = (program?.modules || []).length;

  return (
    <div className="learn cp">
      {/* One programme is the usual case, and then its name is just a label.
          The picker only appears when there is actually something to pick. */}
      <div className="cp-top">
        {programs.length > 1 ? (
          <div className="learn-prog-pick">
            <span className="learn-eyebrow" id="learn-prog-label">Program</span>
            <Select value={program?._id || undefined} onValueChange={(v) => { if (v) { setParams({ program: v }, { replace: true }); pick(v); } }}>
              <SelectTrigger aria-labelledby="learn-prog-label"><SelectValue placeholder="Select a program…" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => <SelectItem key={p._id} value={p._id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : program ? (
          <div className="cp-program">{program.title}</div>
        ) : null}
      </div>

      {!program ? (
        <div className="panel empty-state"><p className="muted">{programs.length ? 'Choose a program above to start learning.' : 'No programme yet: it appears here once you are enrolled.'}</p></div>
      ) : flat.length === 0 ? (
        <div className="panel empty-state"><p className="muted">No lessons published yet.{!isStudent ? ' Add curriculum in Programs → Manage curriculum.' : ' Check back soon.'}</p></div>
      ) : (
        <div className="cp-layout">
          {/* ── The player column ── */}
          <main className="cp-main">
            {/* Phones only: "This lesson" is the video, its title and notes;
                "All lessons" is the module list and nothing else. */}
            {reading && (
              <div className="cp-seg" role="tablist" aria-label="Lesson view">
                <button type="button" role="tab" aria-selected={mobileTab === 'about'} onClick={() => setMobileTab('about')}>This lesson</button>
                <button type="button" role="tab" aria-selected={mobileTab === 'lessons'} onClick={showAllLessons}>All lessons <span className="cp-seg-n">{flat.length}</span></button>
              </div>
            )}

            {topic && hasVideo && (
              <div className={`cp-player ${lessonsView ? 'phone-hide' : ''}`}>
                {vdoId
                  ? (
                    <VdoPlayer
                      key={topic._id}
                      videoId={vdoId}
                      title={topic.title}
                      onWatched={() => markDone(topic._id)}
                      clock={clock}
                      upNext={next && !nextLocked ? { title: next.topic.title, onPlay: () => selectTopic(next) } : null}
                    />
                  )
                  : <LessonSoon key={topic._id} url={topic.contentUrl || topic.classLink || ''} />}
              </div>
            )}

            {reading ? (
              <>
                <div className={`cp-info ${lessonsView ? 'phone-hide' : ''}`}>
                  <div className="cp-crumb"><span>{crumb}</span><span className="cp-pos">{position}</span></div>
                  <h1 className="cp-title">{topic ? topic.title : page.title}</h1>

                  <div className="cp-actions">
                    {topic && isStudent && isDone && (
                      <span className="cp-status" role="status"><LineIcon name="check" size={15} /> Completed</span>
                    )}
                    {page && (
                      <button className="btn cp-complete" disabled={pageStart < 0} onClick={() => flat[pageStart] && selectTopic(flat[pageStart])}>{page.startLabel} →</button>
                    )}
                    <ChipRow media={topic ? mediaOf(topic) : page.media} subtitle={topic ? topic.title : page.crumb} onOpen={setViewer} />
                  </div>

                  {/* Step through the course: previous lesson on the left,
                      next on the right, and between them the video's own
                      timeline. Next stops at a module whose quiz is waiting. */}
                  {topic && (
                    <div className="cp-step">
                      <button
                        type="button"
                        className="cp-step-btn"
                        disabled={idx <= 0}
                        onClick={() => flat[idx - 1] && selectTopic(flat[idx - 1])}
                        aria-label="Previous lesson"
                        title={idx > 0 ? lessonWords(flat[idx - 1].topic.title) : undefined}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 4.5v15a1 1 0 0 1-1.5.87l-12-7.5a1 1 0 0 1 0-1.74l12-7.5A1 1 0 0 1 17 4.5z" fill="currentColor" /></svg>
                      </button>
                      {vdoId ? (
                        <StepTimeline clock={clock} />
                      ) : (
                        <div className="cp-step-mid" title={`Lesson ${idx + 1} of ${flat.length}`}>
                          <div className="cp-step-bar is-static" role="progressbar" aria-label="Position in the course" aria-valuemin={1} aria-valuemax={flat.length} aria-valuenow={idx + 1}>
                            <span className="cp-step-done" style={{ width: `${((idx + 1) / flat.length) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        className="cp-step-btn"
                        disabled={!next || nextLocked}
                        onClick={() => next && selectTopic(next)}
                        aria-label={nextLocked ? 'Next lesson (take the module quiz to unlock it)' : 'Next lesson'}
                        title={next ? (nextLocked ? 'Take the module quiz to unlock the next module' : lessonWords(next.topic.title)) : undefined}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" /></svg>
                      </button>
                    </div>
                  )}


                </div>

                {/* The lesson's own notes. */}
                <div className={`cp-after ${lessonsView ? 'phone-hide' : ''}`}>
                  {hasAbout ? (
                    <div className="cp-body"><Markdown text={bodyText} /></div>
                  ) : topic && !hasVideo ? (
                    <p className="cp-empty">Nothing has been added to this lesson yet. Check back soon.</p>
                  ) : null}
                </div>
              </>
            ) : (
              /* Nothing open: only reachable by folding a page away, since
                 arrival opens a lesson by itself. */
              resume && (
                <div className="cp-resume">
                  <div className="cp-resume-eyebrow">
                    {resume.kind === 'resume' ? 'Continue learning' : resume.kind === 'revisit' ? 'All done: revisit' : resume.kind === 'continue' ? 'Up next' : 'Start here'}
                  </div>
                  <div className="cp-resume-row">
                    <span className="cp-resume-icon"><LessonIcon type={resume.f.topic.contentType} size={22} /></span>
                    <div className="cp-resume-text">
                      <div className="cp-resume-crumb">Module {modIndexOf(resume.f.modId) + 1} · Lesson {resume.idx + 1} of {flat.length}</div>
                      <div className="cp-resume-title">{lessonWords(resume.f.topic.title)}</div>
                    </div>
                  </div>
                  <button className="btn cp-resume-btn" onClick={() => selectTopic(resume.f)}>
                    {resume.kind === 'resume' ? 'Resume' : resume.kind === 'revisit' ? 'Open again' : resume.kind === 'continue' ? 'Continue' : 'Start'} →
                  </button>
                </div>
              )
            )}
          </main>

          {/* ── The list ── */}
          <aside className={`cp-side ${reading && mobileTab !== 'lessons' ? 'phone-hide' : ''}`} id="learn-syllabus">
            <div className="cp-side-head">
              <div className="cp-side-title">Course content</div>
              <div className="cp-side-prog">
                <span>{isStudent && total > 0 ? `${done} of ${total} lessons done` : `${flat.length} lesson${flat.length === 1 ? '' : 's'} · ${weeks} week${weeks === 1 ? '' : 's'}`}</span>
                {isStudent && total > 0 && <strong>{pct}%</strong>}
              </div>
              {isStudent && total > 0 && (
                <div className="cp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Lessons completed"><span style={{ width: `${pct}%` }} /></div>
              )}
              {isStudent && pct === 100 && <button className="btn sm cp-cert" onClick={viewCertificate}>🎓 View certificate</button>}
              {pendingGate && (
                <button type="button" className="cp-pending" onClick={() => setParams({ tab: 'quizzes' })}>
                  <LineIcon name="key" size={14} /> Module {modIndexOf(pendingGate.moduleId) + 1} quiz is waiting. Take it to unlock the next week
                </button>
              )}
            </div>
            <div className="cp-list">
            {(program.modules || []).map((m, mi) => {
              const mTopics = (m.chapters || []).flatMap((c) => c.topics || []);
              const mDone = mTopics.filter((t) => completed.has(t._id)).length;
              const locked = isLocked(mi);
              const gate = gateFor(m._id);
              return (
                <div key={m._id} className={`cur-mod ${locked ? 'locked' : ''} ${String(m._id) === String(currentModId) ? 'current' : ''}`}>
                  <button
                    className={`cur-mod-head ${pageRef?.kind === 'module' && String(pageRef.id) === String(m._id) ? 'showing' : ''}`}
                    onClick={() => !locked && pressModule(m)}
                    disabled={locked}
                    aria-expanded={!locked && !!open[m._id]}
                    title={locked ? 'Attempt the previous module’s quiz to unlock this one' : undefined}
                  >
                    <span className="cur-mod-idx">{locked ? <LineIcon name="key" size={13} /> : String(mi + 1).padStart(2, '0')}</span>
                    <span className="cur-mod-title">{m.title}<span className="cur-mod-sub">{locked ? 'Locked' : isStudent ? `${mDone} / ${mTopics.length} done` : `${mTopics.length} lesson${mTopics.length === 1 ? '' : 's'}`}</span></span>
                    <span className={`cur-caret ${open[m._id] ? 'up' : ''}`}>⌄</span>
                  </button>
                  {!locked && open[m._id] && (m.chapters || []).map((c) => {
                    const hasPage = !!c.description;
                    const unfolded = !hasPage || String(openChap) === String(c._id);
                    const shortTitle = stripParentContext(c.title, m.title);
                    const showingPage = pageRef?.kind === 'chapter' && String(pageRef.id) === String(c._id);
                    return (
                      <div key={c._id} className={`cur-chap ${hasPage ? 'foldable' : ''}`}>
                        {hasPage ? (
                          <button className={`cur-chap-head ${unfolded ? 'open' : ''}`} onClick={() => pressChapter(c)} aria-expanded={unfolded}>
                            <span className="cur-chap-head-title">{shortTitle}</span>
                            <span className={`cur-caret ${unfolded ? 'up' : ''}`}>⌄</span>
                          </button>
                        ) : (
                          (m.chapters.length > 1 || c.title !== 'Lessons') && <div className="cur-chap-title">{shortTitle}</div>
                        )}
                        {unfolded && hasPage && (
                          <button className={`cur-topic cur-page ${showingPage ? 'active' : ''}`} onClick={() => showPage({ kind: 'chapter', id: String(c._id) })}>
                            <span className="cur-page-icon"><LineIcon name="book" size={12} /></span>
                            <span className="cur-topic-title">{c.pageLabel || 'Overview'}</span>
                          </button>
                        )}
                        {unfolded && (c.topics || []).map((t) => {
                          const active = t._id === topicId;
                          const tdone = completed.has(t._id);
                          return (
                            <button key={t._id} className={`cur-topic ${active ? 'active' : ''} ${tdone ? 'done' : ''}`} onClick={() => selectTopic({ topic: t, modId: m._id, chapId: c._id })} aria-current={active ? 'true' : undefined}>
                              <span className="cur-tick">{tdone && <LineIcon name="check" size={9} />}</span>
                              <span className="cur-topic-kind" aria-hidden="true"><LessonIcon type={t.contentType} size={13} /></span>
                              <span className="cur-topic-title">{t.title}</span>
                              {active && <span className="cur-topic-now">{hasVideo ? 'Playing' : 'Open'}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!locked && open[m._id] && gate && (
                    <button className={`cur-topic cur-gate ${gate.myAttempt ? 'done' : ''}`} onClick={() => setParams({ tab: 'quizzes' })}>
                      <span className="cur-tick">{gate.myAttempt && <LineIcon name="check" size={9} />}</span>
                      <span className="cur-topic-kind" aria-hidden="true"><LineIcon name="key" size={13} /></span>
                      <span className="cur-topic-title">Module {mi + 1} quiz{gate.myAttempt ? '' : ', unlocks the next module'}</span>
                    </button>
                  )}
                </div>
              );
            })}
            </div>
          </aside>
        </div>
      )}

      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Lesson recordings live on VdoCipher and nowhere else. A lesson whose video
// is not there yet shows this card: a quiet word for the student, and for the
// admin the way to fix it. Never an error, never a raw link.
// The video's timeline between the ◀ and ▶ buttons: elapsed on the left,
// length on the right, and a bar that can be clicked or dragged to seek.
// Subscribes to the clock, so only this re-renders as the video plays.
function StepTimeline({ clock }) {
  const { time, duration } = useSyncExternalStore(clock.subscribe, clock.get);
  const bar = useRef(null);
  const dragging = useRef(false);
  const frac = duration ? Math.min(1, time / duration) : 0;

  const fractionAt = (e) => {
    const r = bar.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const down = (e) => {
    if (!duration) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    clock.seek(fractionAt(e));
  };
  const move = (e) => { if (dragging.current) clock.seek(fractionAt(e)); };
  const up = () => { dragging.current = false; };
  const key = (e) => {
    if (!duration) return;
    const step = { ArrowLeft: -5, ArrowRight: 5, Home: -Infinity, End: Infinity }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    clock.seek(Math.min(1, Math.max(0, (time + step) / duration)));
  };

  return (
    <div className="cp-step-mid">
      <div
        ref={bar}
        className="cp-step-bar"
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
      >
        <span className="cp-step-done" style={{ width: `${frac * 100}%` }} />
        <span className="cp-step-here" style={{ left: `${frac * 100}%` }} />
      </div>
    </div>
  );
}

function LessonSoon({ url, failed, onRetry }) {
  const { user } = useOutletContext();
  const canManage = user?.role && user.role !== 'student';
  return (
    <div className="lesson-soon" role="status">
      <span className="lesson-soon-mark" aria-hidden="true"><LineIcon name="video" size={22} /></span>
      <p className="lesson-soon-title">{failed ? 'This video is taking a moment.' : 'This lesson’s video is on its way.'}</p>
      <p className="lesson-soon-sub">{failed ? 'Give it another go, or come back in a little while.' : 'The notes below are ready; the recording will appear here once it is published.'}</p>
      {failed && <div className="lesson-soon-actions"><button type="button" className="btn sm" onClick={onRetry}>Try again</button></div>}
      {canManage && (
        <p className="lesson-soon-admin">
          {failed ? 'The file at this link did not play.' : url ? 'This lesson is not linked to a VdoCipher video yet; the link it carries is ignored.' : 'This lesson has no video linked.'}
          {' '}Students see this card. Link the recording in Programs → Manage curriculum.
        </p>
      )}
    </div>
  );
}

// An assignment walkthrough is a plain file: the browser plays it, and a file
// that will not play even after a quiet second try gets the card above.
function PlainVideo({ url }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const onError = () => {
    if (attempt === 0) { setTimeout(() => setAttempt(1), 1200); return; }
    setFailed(true);
  };
  if (!url || failed) return <LessonSoon url={url} failed={failed} onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;
  // preload="none": the browser's default fetches metadata the moment the
  // element mounts, so every walkthrough paid for a range request nobody had
  // asked to play. The box is sized by CSS, so holding off costs no layout.
  return <video key={attempt} src={url} controls preload="none" className="lesson-video" onError={onError} />;
}

function Assignments() {
  const [items, setItems] = useState([]);
  // Before the first response an empty list means "not known yet", announcing
  // "no assignments" and then replacing it reads as a bug, not as loading.
  const [loading, setLoading] = useState(true);
  // A dropdown list: every card folds to its header, and one opens at a time.
  const [openId, setOpenId] = useState(null);
  const load = () => api('/assignments?scope=mine').then((d) => setItems(d.assignments || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="list">
        {[0, 1].map((n) => <div key={n} className="panel skeleton-row" style={{ height: 160 }} />)}
      </div>
    );
  }
  if (items.length === 0) return <p className="muted">No assignments yet. They appear once they're set.</p>;
  return (
    <div className="list">
      {items.map((a) => (
        <AssignmentCard
          key={a._id}
          a={a}
          onChange={load}
          open={openId === a._id}
          onToggle={() => setOpenId((cur) => (cur === a._id ? null : a._id))}
        />
      ))}
    </div>
  );
}

// Mirrors the admin-side DRIVE_TYPES list, in student-facing wording.
const REQUIRED_LABELS = {
  doc: 'A document (PDF, Word or text file)',
  slides: 'A slide deck (PPT)',
  html: 'An HTML file or artifact',
};

function AssignmentCard({ a, onChange, open, onToggle }) {
  const sub = a.mySubmission;
  const [driveLink, setDriveLink] = useState(sub?.driveLink || '');
  const [pdf, setPdf] = useState(null); // { label, subtitle, url }
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Editing re-runs verification server-side, so stale error text can
      // never survive a changed link.
      if (sub) await api(`/submissions/${sub._id}`, { method: 'PATCH', body: { driveLink } });
      else await api('/submissions', { method: 'POST', body: { assignmentId: a._id, driveLink } });
      setEditing(false);
      onChange();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!sub || !window.confirm('Delete this submission? This can’t be undone.')) return;
    setBusy(true);
    setError('');
    try { await api(`/submissions/${sub._id}`, { method: 'DELETE' }); onChange(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const fmt = (d) => new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const overdue = a.dueDate && new Date(a.dueDate) < new Date();
  const notOpenYet = a.startDate && new Date(a.startDate) > new Date();
  const start = a.startDate && fmt(a.startDate);
  const showForm = (!sub || editing) && !notOpenYet;
  // Mirrors the server's rules, the API is still the authority, this just
  // avoids offering an action that would be rejected.
  const editable = !sub?.locked && !overdue && !notOpenYet;
  const required = (a.requiredDriveTypes || []).map((t) => REQUIRED_LABELS[t] || t);
  const noun = a.type === 'project' ? 'project' : 'assignment';
  // No video and no PDF means no left column at all, an empty rail beside
  // the brief reads as something that failed to load.
  const hasMedia = Boolean(a.videoUrl || a.pdfUrl);

  // One badge in the corner answers "where do I stand" before anything else.
  // A passed deadline gets no badge of its own: no "Missed".
  const state = !sub
    ? (notOpenYet ? ['Opens soon', 'badge-muted'] : overdue ? null : ['Not submitted', 'badge-muted'])
    : sub.status === 'graded' ? ['Graded', 'badge-student']
    : sub.status === 'submitted' ? ['Submitted', 'badge-submitted']
    : [sub.status, ''];

  return (
    <div className={`panel assign-card ${open ? 'is-open' : ''}`}>
      <button type="button" className="assign-head" onClick={onToggle} aria-expanded={open} aria-controls={`assign-${a._id}`}>
        <span className="assign-headline">
          <span className="assign-title">
            <span className="assign-name">{a.title}</span>
            <span className={`badge ${a.type === 'project' ? 'badge-accent' : ''}`}>{a.type}</span>
          </span>
        </span>
        {state && <span className={`badge ${state[1]}`}>{state[0]}</span>}
        <span className="assign-caret" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>

      {/* Two columns. Watching on the left, the video with the brief PDF
          under it; handing in on the right. The media column sticks, so the
          video stays put while a student works down the right-hand side. */}
      {open && (
      <div className={`assign-split ${hasMedia ? '' : 'solo'}`} id={`assign-${a._id}`}>
        {hasMedia && (
          <div className="assign-media">
            <h4 className="assign-pane-head">{a.videoUrl ? 'Walkthrough' : 'Resources'}</h4>
            {a.videoUrl && (
              <div className="assign-video">
                <PlainVideo key={`${a._id}-v`} url={a.videoUrl} />
              </div>
            )}
            {a.pdfUrl && (
              <button type="button" className="assign-resource" onClick={() => setPdf({ label: 'PDF', subtitle: a.title, url: a.pdfUrl })}>
                <span className="assign-resource-icon"><LessonIcon type="pdf" size={18} /></span>
                <span className="assign-resource-text">
                  <strong>{a.type === 'project' ? 'Project' : 'Assignment'} brief</strong>
                  <span>PDF · opens in the viewer</span>
                </span>
                <span className="assign-resource-cta">Open</span>
              </button>
            )}
          </div>
        )}

        <div className="assign-work">
          <aside className="assign-submitpane">
            {/* The heading sits above the box, as "Walkthrough" sits above the
                video, so the box and the video start on the same line. */}
            <h4 className="assign-pane-head">Your submission</h4>
            <div className="assign-rail">

              {/* Current verification state: visible without opening notifications. */}
              {sub && !editing && (
                <SubmissionCheckPanel submission={{ ...sub, driveLink: sub.driveLink || sub.url }} audience="student" />
              )}

              {sub?.status === 'graded' && (
                <div className="graded">
                  <div className="tile-value">{sub.score != null ? `${sub.score}/10` : '-'}</div>
                  <div><strong>Score</strong>{sub.feedback && <p className="muted">“{sub.feedback}”</p>}</div>
                </div>
              )}

              {error && <p className="sub-check-error">{error}</p>}

              {notOpenYet ? (
                <p className="assign-note">Submissions for this {noun} open on {start}.</p>
              ) : showForm ? (
                <form className="sub-form" onSubmit={submit}>
                  {/* On an edit after a failed check, lead with what needs fixing. */}
                  {editing && (sub?.checkStatus === 'NEEDS_FIXES' || sub?.checkStatus === 'CHECK_FAILED') && sub?.errorDetail && (
                    <div className="sub-form-alert">
                      <CheckBadge status={sub.checkStatus} audience="student" />
                      <p>{sub.errorDetail}</p>
                    </div>
                  )}

                  {/* What the automated check will look for, shown so the student
                      isn't guessing at what the folder must contain. */}
                  {required.length > 0 && (
                    <div className="assign-reqs">
                      <span className="sub-field-label">Your folder must contain</span>
                      <ul className="assign-req-list">
                        {required.map((r) => <li key={r}><LineIcon name="check" size={15} />{r}</li>)}
                      </ul>
                    </div>
                  )}

                  <label className="sub-field-label" htmlFor={`drive-${a._id}`}>Google Drive folder link</label>
                  <div className="assign-linkfield">
                    <LineIcon name="folder" size={16} />
                    <input
                      id={`drive-${a._id}`}
                      type="url"
                      placeholder="https://drive.google.com/drive/folders/…"
                      value={driveLink}
                      onChange={(e) => setDriveLink(e.target.value)}
                      required
                    />
                  </div>
                  <p className="sub-form-hint">Share the folder as “Anyone with the link can view”, and include everything the task asks for.</p>

                  <div className="assign-submit">
                    <button className="btn" disabled={busy}>{busy ? 'Checking…' : (sub ? 'Save changes' : 'Submit for review')}</button>
                    {sub && <button type="button" className="btn ghost" onClick={() => { setEditing(false); setError(''); setDriveLink(sub.driveLink || ''); }}>Cancel</button>}
                  </div>
                </form>
              ) : sub?.locked ? (
                <p className="assign-note">This submission has been reviewed and is locked. Ask your administrator to unlock it if you need to change it.</p>
              ) : overdue ? (
                <p className="assign-note">The deadline has passed, so this submission can no longer be changed.</p>
              ) : (
                <div className="assign-submit">
                  <button type="button" className="btn ghost sm" onClick={() => setEditing(true)} disabled={!editable}>Edit link</button>
                  <button type="button" className="btn quiet sm" onClick={remove} disabled={busy || !editable}>Delete</button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      )}

      {pdf && <FileViewer url={pdf.url} label={pdf.label} subtitle={pdf.subtitle} onClose={() => setPdf(null)} />}
    </div>
  );
}

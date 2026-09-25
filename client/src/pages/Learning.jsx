import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FileViewer from '../components/FileViewer.jsx';
import Markdown from '../components/Markdown.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import LineIcon from '../components/LineIcon.jsx';
import VdoPlayer from '../components/VdoPlayer.jsx';
import { CheckBadge, SubmissionCheckPanel } from '../components/SubmissionCheck.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { mediaOf, mediaFrom, stripParentContext } from '../lib/syllabus.js';
import CertificateModal from '../components/CertificateModal.jsx';

// Learning. For students: Content + Assignments (submit) + Quizzes (take).
// For admins: just the course content to teach from — they create &
// grade assignments/quizzes under Course, not here.
export default function Learning() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // ?tab= lets search results (and shared links) open straight onto the right
  // tab — "assignments" hits from ⌘K would otherwise land on Content.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = params.get('tab');
    return ['content', 'assignments', 'quizzes'].includes(t) ? t : 'content';
  });

  // …and keeps working when a result is opened while already on this page.
  const wantTab = params.get('tab');
  const wantTopic = params.get('topic');
  useEffect(() => {
    if (wantTab && ['content', 'assignments', 'quizzes'].includes(wantTab)) setTab(wantTab);
    else if (wantTopic) setTab('content');
  }, [wantTab, wantTopic]);

  if (!isStudent) {
    return (
      <div>
        <h1>Learning</h1>
        <p className="muted">The course content your students see — teach from this. Create &amp; grade projects and quizzes under <b>Course</b>.</p>
        <Content />
      </div>
    );
  }

  return (
    <div>
      <h1>Learning</h1>
      <div className="tabs">
        <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Content</button>
        <button className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Assignments & Projects</button>
        <button className={`tab ${tab === 'quizzes' ? 'active' : ''}`} onClick={() => setTab('quizzes')}>Quizzes</button>
      </div>
      {tab === 'content' && <Content />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'quizzes' && <Quizzes />}
    </div>
  );
}

// Every quiz in one place. The module gates come first, in module order, and
// unlock one at a time: gate N opens only once gate N-1 has been attempted —
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
      // programme *id*, which we already have — so they go out alongside the
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
            Attempt each one to unlock the next module — and the next quiz.
          </p>
          <div className="list">
            {gates.map((q, i) => (i < open ? (
              <QuizCard key={q._id} quiz={q} onDone={load} />
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
            {others.map((q) => <QuizCard key={q._id} quiz={q} onDone={load} />)}
          </div>
        </>
      )}
    </div>
  );
}

function QuizCard({ quiz, onDone }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [review, setReview] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const attempt = quiz.myAttempt;
  const total = quiz.questions.length;
  const allAnswered = quiz.questions.every((_, i) => answers[i] != null);
  const q = quiz.questions[qIndex];

  // Once answering has begun, warn before an accidental tab close / reload —
  // draft answers live only in local state and aren't saved until submit.
  const dirty = open && !attempt && Object.keys(answers).length > 0 && !busy;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const ordered = quiz.questions.map((_, i) => (answers[i] ?? -1));
      await api(`/quizzes/${quiz._id}/attempt`, { method: 'POST', body: { answers: ordered } });
      onDone();
    } finally { setBusy(false); }
  }

  // Fetched once, then toggled — the review never changes after an attempt.
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
    <div className="panel">
      <div className="row">
        <strong>{quiz.title}</strong>
        <span className="badge">{quiz.type}</span>
        {attempt && <span className="badge badge-student">Scored {attempt.score}/{attempt.total}</span>}
      </div>
      {!attempt && !open && <button className="btn sm" onClick={() => { setOpen(true); setQIndex(0); }}>Take quiz</button>}
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
      {!attempt && open && (
        <form onSubmit={submit} className="quiz-take">
          <QuizStepper
            count={total}
            current={qIndex}
            onSelect={setQIndex}
            statusFor={(i) => (answers[i] != null ? 'answered' : 'unanswered')}
          />
          <div className="quiz-take-q-solo">
            <p className="quiz-take-q-count">Question {qIndex + 1} of {total}</p>
            <p className="quiz-take-q-text"><strong>{q.text}</strong></p>
            {q.options.map((o, oi) => (
              <label key={oi} className="quiz-opt">
                <input type="radio" name={`q-${quiz._id}-${qIndex}`} checked={answers[qIndex] === oi} onChange={() => setAnswers((a) => ({ ...a, [qIndex]: oi }))} />
                {o}
              </label>
            ))}
          </div>
          <div className="quiz-take-nav">
            <button type="button" className="btn ghost sm" disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>← Previous</button>
            {qIndex < total - 1 ? (
              <button type="button" className="btn sm" onClick={() => setQIndex((i) => i + 1)}>Next →</button>
            ) : (
              <button className="btn sm" disabled={busy || !allAnswered}>{busy ? 'Submitting…' : 'Submit answers'}</button>
            )}
          </div>
          {qIndex === total - 1 && !allAnswered && <p className="muted quiz-take-hint">Answer every question to submit.</p>}
        </form>
      )}
    </div>
  );
}

// Numbered step navigation shared by the take-quiz and review-quiz views, so
// a student jumps straight to any question instead of scrolling a stack of
// blocks. `statusFor` colors each pip: answered/unanswered while taking,
// correct/incorrect while reviewing.
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
// teaches — shown one question at a time via the stepper above it.
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

// ── Reader furniture shared by lessons and pages ──────────────────────────
// A page and a lesson must be indistinguishable in structure, so the chip row
// below is written once and called from both heads.

// One chip row, rendered from the lesson head and the page head alike.
// Empty fields render disabled rather than disappearing: a missing button
// reads as "there is no video", whereas "No class video yet" tells a student
// to come back.
function ChipRow({ media, subtitle, onOpen }) {
  const chips = [
    { key: 'reading', type: 'pdf', label: 'Reading material', empty: 'No reading yet', url: media.reading },
    { key: 'notes', type: 'text', label: 'Notes', empty: 'No notes yet', url: media.notes },
    { key: 'klass', type: 'video', label: 'Class video', empty: 'No class video yet', url: media.klass, external: true },
  ];
  return (
    <div className="lesson-actions">
      {chips.map((c) => {
        if (!c.url) {
          return (
            <button key={c.key} className="btn sm lesson-action" disabled title={`${c.empty} — check back later`}>
              <LessonIcon type={c.type} size={15} /> {c.empty}
            </button>
          );
        }
        // A class link is a meeting or a recording elsewhere; the two file
        // slots open in the in-page viewer as they always have.
        return c.external ? (
          <a key={c.key} className="btn sm lesson-action" href={c.url} target="_blank" rel="noreferrer">
            <LessonIcon type={c.type} size={15} /> {c.label}
          </a>
        ) : (
          <button key={c.key} className="btn sm lesson-action" onClick={() => onOpen({ label: c.label, subtitle, url: c.url })}>
            <LessonIcon type={c.type} size={15} /> {c.label}
          </button>
        );
      })}
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
  // It never enters the URL — a deep link still names a lesson.
  const [pageRef, setPageRef] = useState(null); // { kind: 'module'|'chapter', id }
  const [open, setOpen] = useState({});
  // Only one chapter is unfolded at a time, so a module's chapters all stay on
  // screen instead of the accordion pushing the scrolling one level down.
  const [openChap, setOpenChap] = useState(null);
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);
  const [viewer, setViewer] = useState(null); // { label, subtitle, url }
  // Gate quizzes, one per module. Attempting a module's quiz unlocks the next.
  const [gates, setGates] = useState([]);       // [{ _id, moduleId, myAttempt, … }]

  const loadGates = (programId) => api(`/quizzes?programId=${programId}`)
    .then((d) => setGates(d.quizzes || []))
    .catch(() => setGates([]));

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
  // switch, a module an admin removed), or the target carries no page text —
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

  const loadProgress = (programId) => {
    if (!isStudent || !programId) return;
    api(`/progress/me?programId=${programId}`).then((d) => { setCompleted(new Set(d.completedTopics)); setTotal(d.total); }).catch(() => {});
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
    // we already hold — starting them here rather than after the tree arrives
    // takes a round trip off the critical path for the whole screen.
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
      // Nothing is selected on arrival. The reader shows its landing panel and
      // the student chooses a week — auto-selecting lesson 1 used to bury the
      // syllabus under content nobody had asked for.
      setOpen({}); setOpenChap(null); setTopicId(null);
    }
  }

  // Showing a page clears the lesson, and takes ?topic= with it: a page is not
  // addressable, so leaving a stale lesson id in the URL would make Back and a
  // copied link disagree with what's on screen.
  function showPage(ref) {
    setPageRef(ref);
    setTopicId(null);
    if (program) setParams({ program: program._id }, { replace: true });
  }

  // Pressing a module opens it and shows its page. Pressing the one already
  // open, while its page is showing, folds it away and returns the reader to
  // the landing state.
  function pressModule(m) {
    const id = String(m._id);
    const showingPage = pageRef?.kind === 'module' && String(pageRef.id) === id;
    // Fold it away when pressing the module that's already open while its page
    // is showing — or, for a module that has no page, on any second press,
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

  // Unfolding a chapter must NOT touch the reader. You open a week to read its
  // overview; looking at what a session contains shouldn't take that away
  // before you've chosen anything inside it.
  const pressChapter = (c) =>
    setOpenChap((cur) => (String(cur) === String(c._id) ? null : String(c._id)));

  function selectTopic(f) {
    setTopicId(f.topic._id);
    setPageRef(null);
    setOpen((o) => ({ ...o, [f.modId]: true }));
    setOpenChap(String(f.chapId));
    // replace, not push — Prev/Next shouldn't fill the back button with lessons.
    if (program) setParams({ program: program._id, topic: String(f.topic._id) }, { replace: true });
  }

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

  // A search result opened while already on this page only changes the URL —
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

  async function toggleComplete(tid) {
    const { completedTopics } = await api('/progress/toggle', { method: 'POST', body: { programId: program._id, topicId: tid } });
    setCompleted(new Set(completedTopics));
  }
  async function viewCertificate() {
    const c = await api(`/progress/certificate?programId=${program._id}`);
    if (c.eligible) setCert(c);
  }

  const done = Math.min(completed.size, total);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isDone = topic && completed.has(topic._id);
  // A DRM lesson wins over every plain URL on the topic: if the admin put the
  // recording in VdoCipher, that is where it is watched.
  const vdoId = topic?.contentType === 'video' && topic?.videoSource === 'vdocipher' ? (topic.vdoVideoId || '') : '';
  const videoUrl = vdoId ? '' : (topic?.contentType === 'video' ? topic?.contentUrl : '') || topic?.classLink || '';

  return (
    <div className="learn">
      {/* Header: program picker + progress ring */}
      <div className="learn-top">
        <div className="learn-prog-pick">
          <span className="learn-eyebrow" id="learn-prog-label">Program</span>
          <Select value={program?._id || undefined} onValueChange={(v) => { if (v) { setParams({ program: v }, { replace: true }); pick(v); } }}>
            <SelectTrigger aria-labelledby="learn-prog-label"><SelectValue placeholder="Select a program…" /></SelectTrigger>
            <SelectContent>
              {programs.map((p) => <SelectItem key={p._id} value={p._id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {program && isStudent && total > 0 && (
          <div className="learn-progress">
            <Ring pct={pct} />
            <div>
              <div className="learn-progress-pct">{pct}% complete</div>
              <div className="muted">{done} of {total} lessons</div>
            </div>
            {pct === 100 && <button className="btn sm" onClick={viewCertificate}>🎓 Certificate</button>}
          </div>
        )}
      </div>

      {!program ? (
        <div className="panel empty-state"><p className="muted">Choose a program above to start learning.</p></div>
      ) : flat.length === 0 ? (
        <div className="panel empty-state"><p className="muted">No lessons published yet.{!isStudent ? ' Add curriculum in Programs → Manage curriculum.' : ' Check back soon.'}</p></div>
      ) : (
        <div className="learn-grid">
          {/* Curriculum sidebar */}
          <aside className="curriculum" id="learn-syllabus">
            {(program.modules || []).map((m, mi) => {
              const mTopics = (m.chapters || []).flatMap((c) => c.topics || []);
              const mDone = mTopics.filter((t) => completed.has(t._id)).length;
              const locked = isLocked(mi);
              const gate = gateFor(m._id);
              return (
                <div key={m._id} className={`cur-mod ${locked ? 'locked' : ''}`}>
                  <button
                    className={`cur-mod-head ${pageRef?.kind === 'module' && String(pageRef.id) === String(m._id) ? 'showing' : ''}`}
                    onClick={() => !locked && pressModule(m)}
                    disabled={locked}
                    aria-expanded={!locked && !!open[m._id]}
                    title={locked ? 'Attempt the previous module’s quiz to unlock this one' : undefined}
                  >
                    <span className="cur-mod-idx">{locked ? <LineIcon name="key" size={13} /> : String(mi + 1).padStart(2, '0')}</span>
                    <span className="cur-mod-title">{m.title}</span>
                    {!locked && isStudent && mTopics.length > 0 && <span className="cur-mod-count">{mDone}/{mTopics.length}</span>}
                    {locked ? <span className="cur-mod-count">Locked</span> : <span className={`cur-caret ${open[m._id] ? 'up' : ''}`}>⌄</span>}
                  </button>
                  {!locked && open[m._id] && (m.chapters || []).map((c) => {
                    // Only a chapter that has a page becomes a dropdown of its
                    // own. One without stays exactly as it was — a plain label
                    // with its lessons always visible.
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
                            {/* An icon, not a tick: a page can't be completed,
                                so it must not offer an empty checkbox. */}
                            <span className="cur-page-icon"><LineIcon name="book" size={12} /></span>
                            <span className="cur-topic-title">{c.pageLabel || 'Overview'}</span>
                          </button>
                        )}
                        {unfolded && (c.topics || []).map((t) => {
                          const active = t._id === topicId;
                          const tdone = completed.has(t._id);
                          return (
                            <button key={t._id} className={`cur-topic ${active ? 'active' : ''} ${tdone ? 'done' : ''}`} onClick={() => selectTopic({ topic: t, modId: m._id, chapId: c._id })}>
                              {/* The dot carries state here exactly as it does on the Path. */}
                              <span className="cur-tick" />
                              <span className="cur-topic-title">{t.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {/* The gate sits at the foot of its module — the last thing
                      you reach, and the thing that opens the next one. */}
                  {!locked && open[m._id] && gate && (
                    <button
                      className={`cur-topic cur-gate ${gate.myAttempt ? 'done' : ''}`}
                      // The gate lives on the Quizzes tab — that's where every
                      // quiz is, so sitting one never happens in two places.
                      onClick={() => setParams({ tab: 'quizzes' })}
                    >
                      <span className="cur-tick" />
                      <span className="cur-topic-title">
                        Module {mi + 1} quiz{gate.myAttempt ? '' : ' — unlocks the next module'}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </aside>

          {/* Lesson viewer */}
          <section className="lesson">
            {topic ? (
              <>
                <div className="lesson-head">
                  <div className="lesson-head-top">
                    <div className="lesson-crumb">{current.mod}{current.chap && current.chap !== 'Lessons' ? ` · ${current.chap}` : ''}</div>
                    {/* Same numbers the old line read from — position in the
                        flattened lesson list, so it tracks as you move around. */}
                    <div className="lesson-position">Lesson {idx + 1} of {flat.length}</div>
                  </div>
                  <h2 className="lesson-title">{topic.title}</h2>
                  <ChipRow media={mediaOf(topic)} subtitle={topic.title} onOpen={setViewer} />
                </div>

                <div className="lesson-body">
                  {vdoId
                    ? <VdoPlayer key={topic._id} videoId={vdoId} title={topic.title} />
                    : videoUrl
                      ? <LessonVideo key={topic._id} url={videoUrl} />
                      : <div className="panel empty-state"><p className="muted">No video for this lesson yet.</p></div>}
                  {topic.body && <Markdown text={topic.body} />}
                </div>

                <div className="lesson-foot">
                  <button className="btn ghost sm" disabled={idx <= 0} onClick={() => flat[idx - 1] && selectTopic(flat[idx - 1])}>← Previous</button>
                  {isStudent && (
                    <button className={`btn ${isDone ? 'ghost' : 'on-stage'}`} onClick={() => toggleComplete(topic._id)}>
                      {isDone ? 'Completed' : 'Mark complete'}
                    </button>
                  )}
                  <button className="btn ghost sm" disabled={idx >= flat.length - 1} onClick={() => flat[idx + 1] && selectTopic(flat[idx + 1])}>Next →</button>
                </div>
              </>
            ) : page ? (
              /* A page: a lesson's exact furniture, minus the parts a page
                 can't have — no video, and nothing to mark complete. */
              <>
                <div className="lesson-head">
                  <div className="lesson-head-top">
                    <div className="lesson-crumb">{page.crumb}</div>
                    <div className="lesson-position">{page.position}</div>
                  </div>
                  <h2 className="lesson-title">{page.title}</h2>
                  <ChipRow media={page.media} subtitle={page.crumb} onOpen={setViewer} />
                </div>

                <div className="lesson-body"><Markdown text={page.body} /></div>

                <div className="lesson-foot">
                  <button className="btn ghost sm" disabled={pageStart <= 0} onClick={() => flat[pageStart - 1] && selectTopic(flat[pageStart - 1])}>← Previous</button>
                  <button className="btn on-stage" disabled={pageStart < 0} onClick={() => flat[pageStart] && selectTopic(flat[pageStart])}>{page.startLabel} →</button>
                </div>
              </>
            ) : (
              /* Nothing open. Arriving at Learning selects nothing, so this is
                 the first thing a student sees. No chips — nothing is open for
                 them to point at. */
              <div className="lesson-landing">
                <div className="lesson-landing-name">{program.title}</div>
                <div className="lesson-landing-count">
                  {flat.length} lesson{flat.length === 1 ? '' : 's'}, {(program.modules || []).length} week{(program.modules || []).length === 1 ? '' : 's'}
                </div>
                <p className="lesson-landing-hint">Open a week in the syllabus to choose what to read.</p>
                <button
                  className="btn sm lesson-landing-btn"
                  onClick={() => document.getElementById('learn-syllabus')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Open the syllabus
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Lesson video with a graceful failure path — a dead CDN link or an
// unsupported codec should offer a retry and a direct link, not a black frame.
function LessonVideo({ url }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) {
    return (
      <div className="panel empty-state lesson-video-error">
        <p className="muted">This video couldn’t be loaded. It may have moved, or your connection dropped.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button>
          <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
        </div>
      </div>
    );
  }
  // preload="none": the browser's default fetches metadata the moment the
  // element mounts, so every lesson with a video paid for a range request
  // nobody had asked to play. The box is sized by CSS, so holding off costs
  // no layout — .lesson-video carries the same 16:9 the DRM frame does.
  return <video key={attempt} src={url} controls preload="none" className="lesson-video" onError={() => setFailed(true)} />;
}

// Circular progress indicator.
function Ring({ pct }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    // Not className="ring": that is also Tailwind's ring utility, which drew a
    // 1px box in the text colour around the whole SVG.
    <svg className="progress-ring" width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} className="ring-bg" />
      <circle cx="26" cy="26" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" className="ring-text">{pct}%</text>
    </svg>
  );
}

function Assignments() {
  const [items, setItems] = useState([]);
  // Before the first response an empty list means "not known yet" — announcing
  // "no assignments" and then replacing it reads as a bug, not as loading.
  const [loading, setLoading] = useState(true);
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
      {items.map((a) => <AssignmentCard key={a._id} a={a} onChange={load} />)}
    </div>
  );
}

// Mirrors the admin-side DRIVE_TYPES list, in student-facing wording.
const REQUIRED_LABELS = {
  doc: 'A document (PDF, Word or text file)',
  slides: 'A slide deck (PPT)',
  html: 'An HTML file or artifact',
};

// "3 days left" for the header — the one number a student actually scans for.
// Null once the deadline has passed; the overdue state is worded separately.
function timeLeft(due) {
  const ms = new Date(due) - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return 'Due within the hour';
}

function AssignmentCard({ a, onChange }) {
  const { user } = useOutletContext();
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
  const due = a.dueDate && fmt(a.dueDate);
  const start = a.startDate && fmt(a.startDate);
  const left = a.dueDate && !sub && timeLeft(a.dueDate);
  const showForm = (!sub || editing) && !notOpenYet;
  // Mirrors the server's rules — the API is still the authority, this just
  // avoids offering an action that would be rejected.
  const editable = !sub?.locked && !overdue && !notOpenYet;
  const required = (a.requiredDriveTypes || []).map((t) => REQUIRED_LABELS[t] || t);
  const studentName = user?.full_name || user?.fullName || user?.email;
  const noun = a.type === 'project' ? 'project' : 'assignment';
  // No video and no PDF means no left column at all — an empty rail beside
  // the brief reads as something that failed to load.
  const hasMedia = Boolean(a.videoUrl || a.pdfUrl);

  // One badge in the corner answers "where do I stand" before anything else.
  const state = !sub
    ? (notOpenYet ? ['Opens soon', 'badge-muted'] : overdue ? ['Missed', 'badge-blocked'] : ['Not submitted', 'badge-muted'])
    : sub.status === 'graded' ? ['Graded', 'badge-student']
    : sub.status === 'submitted' ? ['Submitted', 'badge-submitted']
    : [sub.status, ''];

  return (
    <div className="panel assign-card">
      <div className="assign-head">
        <div className="assign-headline">
          <div className="assign-title">
            <h3>{a.title}</h3>
            <span className={`badge ${a.type === 'project' ? 'badge-accent' : ''}`}>{a.type}</span>
          </div>
          <div className="assign-meta">
            {start && <span className="assign-meta-item"><LineIcon name="calendar" size={13} /> Opens {start}</span>}
            {due && (
              <span className={`assign-meta-item ${overdue && !sub ? 'overdue' : ''}`}>
                <LineIcon name="clock" size={13} /> Due {due}
              </span>
            )}
            {left && <span className="assign-countdown">{left}</span>}
            {overdue && !sub && <span className="assign-countdown overdue">Deadline passed</span>}
          </div>
        </div>
        <span className={`badge ${state[1]}`}>{state[0]}</span>
      </div>

      {/* Two columns. Watching and reading on the left — the video, with the
          brief PDF under it; doing, on the right — read the brief, then hand
          the work in directly beneath it. The media column sticks, so the
          video stays put while a student works down the right-hand side. */}
      <div className={`assign-split ${hasMedia ? '' : 'solo'}`}>
        {hasMedia && (
          <div className="assign-media">
            <h4 className="assign-pane-head">{a.videoUrl ? 'Walkthrough' : 'Resources'}</h4>
            {a.videoUrl && (
              <div className="assign-video">
                <LessonVideo key={`${a._id}-v`} url={a.videoUrl} />
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
          <section className="assign-content">
            <h4 className="assign-pane-head">The brief</h4>
            {a.description
              ? <div className="assign-brief"><Markdown text={a.description} /></div>
              : <p className="assign-note">No brief posted for this {noun} yet.</p>}
          </section>

          <aside className="assign-submitpane">
            <div className="assign-rail">
              <h4 className="assign-pane-head">Your submission</h4>

              <dl className="assign-dates">
                <div>
                  <dt>Opens</dt>
                  <dd>{start || 'Open now'}</dd>
                </div>
                <div>
                  <dt>Last date to submit</dt>
                  <dd className={overdue ? 'is-overdue' : ''}>{due || 'No deadline'}</dd>
                </div>
              </dl>

              {/* Current verification state — visible without opening notifications. */}
              {sub && !editing && (
                <SubmissionCheckPanel submission={{ ...sub, driveLink: sub.driveLink || sub.url }} audience="student" />
              )}

              {sub?.status === 'graded' && (
                <div className="graded">
                  <div className="tile-value">{sub.score != null ? `${sub.score}/10` : '—'}</div>
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

                  {/* What the automated check will look for — shown so the student
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
                  <p className="sub-form-hint">Share the folder as “Anyone with the link can view”, and include everything the brief asks for.</p>

                  <div className="assign-submit">
                    <button className="btn" disabled={busy}>{busy ? 'Checking…' : (sub ? 'Save changes' : 'Submit for review')}</button>
                    {sub && <button type="button" className="btn ghost" onClick={() => { setEditing(false); setError(''); setDriveLink(sub.driveLink || ''); }}>Cancel</button>}
                  </div>
                  {studentName && <p className="assign-as">Submitting as <strong>{studentName}</strong></p>}
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

      {pdf && <FileViewer url={pdf.url} label={pdf.label} subtitle={pdf.subtitle} onClose={() => setPdf(null)} />}
    </div>
  );
}

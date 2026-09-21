import { useEffect, useState } from 'react';

/**
 * The illustration on the sign-in hero: the syllabus, working through itself.
 *
 * It is the real curriculum — module codes, lesson codes and titles lifted from
 * the Claude track the LMS actually seeds (server/scripts/seedClaude.js) — laid
 * out the way the classroom lays it out. A module opens, its lessons tick off
 * one at a time, the module closes with a check on it, and the next one opens.
 * The certificate arrives when the track is done.
 *
 * WHY THIS RUNS ON A TIMER RATHER THAN IN KEYFRAMES. The version before this
 * was a single CSS sweep over one flat list, which a stylesheet does well. A
 * sequence that opens a module, walks its lessons, marks it, closes it and
 * moves on is a state machine, and expressing that as a dozen hand-aligned
 * keyframe blocks means a dozen chances for them to fall out of step. Here the
 * schedule is one array read top to bottom, the DOM says what is actually true
 * at each step (data-open, data-done), and CSS is left to do the thing it is
 * best at: transitioning between those states.
 *
 * Entirely decorative: the hero says "Build. Learn. Monetize." in text beside
 * it, so this is aria-hidden and a screen reader is told nothing twice.
 */

/* Three modules of the Claude track, with their real codes and titles. Three
   rather than all eight because the panel has to stay a panel — what matters is
   that this is a syllabus with structure, which reads from three as well as
   from eight, and eight would shrink the type past reading. */
const MODULES = [
  {
    code: 'M01',
    title: 'Foundations — How AI Actually Works',
    lessons: [
      ['1.1', 'What Generative AI Actually Is'],
      ['1.2', 'Tokens, Context Windows & Why Claude Forgets'],
      ['1.3', 'Hallucinations — Why They Happen'],
    ],
  },
  {
    code: 'M02',
    title: 'Working With Claude Well',
    lessons: [
      ['2.1', 'The 4D Framework'],
      ['2.4', 'Projects — Your Persistent Workspace'],
      ['2.5', 'Artifacts — Chat Into Real Deliverables'],
    ],
  },
  {
    code: 'M03',
    title: 'The Visual & Creative Layer',
    lessons: [
      ['3.1', 'Claude and Images — Reading, Not Writing'],
      ['3.2', 'Diagrams, Charts, Interactive Artifacts'],
      ['3.3', 'Claude Design — Prototypes & Mockups'],
    ],
  },
];

const TOTAL = MODULES.reduce((n, m) => n + m.lessons.length, 0);

/**
 * The whole loop, as data.
 *
 * Built rather than written out, because the shape of it is the thing worth
 * reading — open a module, tick each lesson, mark it, close it — and a
 * hand-written list of thirty frames hides that shape in its own length. Each
 * frame carries the complete state, so nothing accumulates across frames and
 * one can be dropped in or out without disturbing its neighbours.
 */
function buildTimeline() {
  const frames = [];
  const done = MODULES.map(() => 0);
  const marked = MODULES.map(() => false);
  const snap = (ms, open, cert = false) =>
    frames.push({ ms, open, cert, done: [...done], marked: [...marked] });

  snap(900, -1);
  MODULES.forEach((m, mi) => {
    snap(650, mi);                                   // the module opens
    m.lessons.forEach((_, li) => { done[mi] = li + 1; snap(1000, mi); });
    marked[mi] = true;
    snap(750, mi);                                   // the check lands on it
    snap(400, -1);                                   // and it closes
  });
  snap(2500, -1, true);                              // the certificate
  /* Back to nothing, as its own frame — the loop resets in one deliberate step
     rather than by the next pass happening to overwrite what the last left. */
  done.fill(0); marked.fill(false);
  snap(500, -1);
  return frames;
}

const TIMELINE = buildTimeline();
const FINISHED = TIMELINE[TIMELINE.length - 2];      // everything done

export default function LoginArt() {
  /* Read once, at mount, and it decides between a timer and a still frame.
     Reading it per render would re-run the effect on every tick. */
  const [still] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const [i, setI] = useState(0);

  useEffect(() => {
    if (still) return undefined;
    /* A chain of timeouts rather than one interval: the frames have different
       lengths — a lesson wants a beat, a collapse does not — and an interval
       would force them all to the same one. */
    const id = setTimeout(() => setI((n) => (n + 1) % TIMELINE.length), TIMELINE[i].ms);
    return () => clearTimeout(id);
  }, [i, still]);

  const frame = still ? { ...FINISHED, cert: true } : TIMELINE[i];
  const doneCount = frame.done.reduce((a, b) => a + b, 0);

  return (
    <div className="login-art" aria-hidden="true">
      <div className="la-scene">
        {/* A second panel, offset behind the first. Depth from one more surface
            rather than from a perspective transform, and it costs no height:
            it is inset at the top and shows only along two edges. */}
        <div className="la-stack" />

        <div className="la-panel">
          <div className="la-head">
            <div>
              <div className="la-eyebrow">Foundations track</div>
              <div className="la-title">AI Fluency with Claude</div>
            </div>
            <div className="la-count">
              <span className="la-count-now">{doneCount}</span>
              <span>/{TOTAL}</span>
            </div>
          </div>

          <div className="la-bar">
            <span className="la-bar-fill" style={{ width: `${(doneCount / TOTAL) * 100}%` }} />
          </div>

          {/* Fixed height, so opening a module does not change the panel's size
              and shunt the whole drawing up the page on every step. */}
          <div className="la-mods">
            {MODULES.map((m, mi) => (
              <div
                className="la-mod"
                key={m.code}
                data-open={frame.open === mi}
                data-done={frame.marked[mi]}
              >
                <div className="la-mod-head">
                  <span className="la-modmark"><span className="la-tick" /></span>
                  <span className="la-mod-code">{m.code}</span>
                  <span className="la-mod-title">{m.title}</span>
                  <span className="la-mod-n">{m.lessons.length}</span>
                  <span className="la-chev" />
                </div>

                {/* 0fr to 1fr: the row collapses to nothing and grows to exactly
                    its content, which a max-height guess never does — too small
                    clips the last lesson, too large eases against empty space. */}
                <div className="la-mod-body">
                  <div className="la-mod-inner">
                    {m.lessons.map(([code, name], li) => (
                      <div className="la-les" key={code} data-done={li < frame.done[mi]}>
                        <span className="la-les-mark"><span className="la-tick" /></span>
                        <span className="la-les-code">{code}</span>
                        <span className="la-les-name">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="la-foot">
            <span className="la-foot-live" />
            Live review · Thursday, 7pm
          </div>
        </div>

        <div className="la-chip" data-show={frame.cert}>
          <span className="la-seal" />
          <span>
            <span className="la-chip-title">Certificate unlocked</span>
            <span className="la-chip-sub">SKEO-FELLO-0926-0007</span>
          </span>
        </div>
      </div>
    </div>
  );
}

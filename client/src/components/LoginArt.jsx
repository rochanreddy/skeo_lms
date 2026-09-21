/**
 * The illustration on the sign-in hero: a module completing itself.
 *
 * It shows the product rather than a stock picture of programming — a course
 * panel with its lessons ticking off one by one, the bar filling behind them,
 * and the certificate arriving at the end. That is the whole arc of the
 * fellowship, and it is the arc the headline beside it names: build, learn,
 * and get paid for it.
 *
 * HOW THE ANIMATION WORKS. The list is drawn twice, once as not-yet-done and
 * once as done, stacked exactly. A single sweep animation clips the done layer
 * from the top, so a lesson "completes" when the clip edge passes it. One
 * timeline drives every part — the rows, the bar, the certificate — which is
 * why they cannot drift out of step with each other. Animating five rows
 * separately and hoping their delays stay aligned is how that drift starts.
 *
 * Both layers carry the same rows so their geometry is identical; the clip is
 * a percentage of the list's height, and it only lines up with a row edge
 * because every row is the same height and the layer has no padding of its own.
 *
 * Entirely decorative: the hero says "Build. Learn. Monetize." in text beside
 * it, so this is aria-hidden and a screen reader is told nothing twice.
 */

/* The module, as data. `kind` picks the glyph — a lesson, a build, a live
   session, a quiz — because a list where every row looks the same does not
   read as a syllabus. */
const LESSONS = [
  { kind: 'play', name: 'Find a problem worth solving', meta: '12 min' },
  { kind: 'build', name: 'Ship a working v1', meta: 'Project' },
  { kind: 'live', name: 'Mentor review', meta: 'Live' },
  { kind: 'quiz', name: 'Pricing your work', meta: '6 questions' },
  { kind: 'build', name: 'Send your first invoice', meta: 'Project' },
];

/* One layer of the list. Rendered twice with different `state`, so the two
   stacks are guaranteed to have the same geometry — the clip that reveals one
   through the other is a percentage, and it only lands on a row boundary while
   both layers agree on where those boundaries are. */
function Rows({ state }) {
  return (
    <div className={`la-layer la-layer--${state}`}>
      {LESSONS.map((l) => (
        <div className="la-row" key={l.name}>
          <span className={`la-glyph la-glyph--${l.kind}`}>
            {/* The tick lives in the markup of both layers and is simply
                invisible on the todo one, so the two rows stay the same height
                whatever happens to it. */}
            <span className="la-tick" />
          </span>
          <span className="la-row-name">{l.name}</span>
          <span className="la-row-meta">{l.meta}</span>
        </div>
      ))}
    </div>
  );
}

export default function LoginArt() {
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
              <div className="la-eyebrow">Module 2 of 6</div>
              <div className="la-title">Ship your first product</div>
            </div>
            <div className="la-count">
              {/* A reel, not a clip. The sweep that reveals the rows cuts at a
                  fraction of the list, and a digit sliced at two fifths of its
                  height reads as a broken glyph rather than as a number — so the
                  count steps a whole digit at a time, on the same percentages. */}
              <span className="la-reel">
                {/* The window stays put and the TRACK moves. Transforming the
                    window itself takes its own clipping box along with it, which
                    sends the digit out of the panel instead of scrolling it. */}
                <span className="la-reel-track">
                  {[0, 1, 2, 3, 4, 5].map((n) => <i key={n}>{n}</i>)}
                </span>
              </span>
              <span className="la-count-of">/5</span>
            </div>
          </div>

          <div className="la-bar"><span className="la-bar-fill" /></div>

          <div className="la-list">
            <Rows state="todo" />
            <Rows state="done" />
          </div>

          <div className="la-foot">
            <span className="la-foot-live" />
            Live review · Thursday, 7pm
          </div>
        </div>

        <div className="la-chip">
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

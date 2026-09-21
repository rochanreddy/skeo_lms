/**
 * The illustration on the sign-in hero: an editor, mid-ship.
 *
 * Drawn in markup rather than shipped as an image. The code and the terminal
 * output are real text, so they stay sharp on every display instead of going
 * soft at 2x like a screenshot would, they cost nothing to download, and they
 * recolour with the theme tokens rather than baking one palette into a PNG that
 * then has to be re-exported whenever the brand moves.
 *
 * IT IS A FLAT COMPOSITION, NOT A 3D ONE. An earlier version drew a laptop with
 * a CSS perspective transform. A tilted lid and a flat slab of a base never
 * share a vanishing point, and the join between them reads as two rectangles
 * rather than as an object — the kind of thing that looks worse the longer you
 * look at it. A squared-up window stack carries the same idea and survives
 * being looked at.
 *
 * Entirely decorative: the hero says "Build. Learn. Monetize." in text beside
 * it, so this is aria-hidden and a screen reader is told nothing twice.
 */

/* One line of the editor, as tokens. Written as data rather than as nested
   spans in the JSX because the shape of the snippet is the thing worth reading
   here, and thirty <span className="la-kw"> wrappers bury it. */
const CODE = [
  [['c', '// the whole job, in four lines']],
  [['k', 'export const'], ['f', ' ship'], ['o', ' = async ('], ['v', 'idea'], ['o', ') => {']],
  [['o', '  '], ['k', 'const'], ['p', ' product '], ['o', '= '], ['k', 'await'], ['f', ' build'], ['o', '('], ['v', 'idea'], ['o', ');']],
  [['o', '  '], ['k', 'await'], ['p', ' product'], ['o', '.'], ['f', 'launch'], ['o', '();']],
  [['o', '  '], ['k', 'return'], ['p', ' product'], ['o', '.'], ['f', 'invoice'], ['o', '();']],
  [['o', '};']],
];

const TOKEN_CLASS = { k: 'kw', f: 'fn', v: 'var', c: 'cm', o: 'op', p: 'pl' };

const FILES = [
  { name: 'src', dir: true },
  { name: 'ship.js', on: true },
  { name: 'client.js' },
  { name: 'invoice.md' },
];

export default function LoginArt() {
  return (
    <div className="login-art" aria-hidden="true">
      <div className="la-scene">
        {/* A second panel, offset behind the first. Depth from one more surface
            rather than from a perspective transform, and it costs no height:
            it is inset at the top and only shows along two edges. */}
        <div className="la-stack" />

        <div className="la-ide">
          <div className="la-bar">
            <span className="la-dot" /><span className="la-dot" /><span className="la-dot" />
            <div className="la-tabs">
              <span className="la-tab la-tab--on">ship.js</span>
              <span className="la-tab">invoice.md</span>
            </div>
          </div>

          <div className="la-main">
            <div className="la-files">
              {FILES.map((f) => (
                <span
                  key={f.name}
                  className={`la-filerow${f.on ? ' la-filerow--on' : ''}${f.dir ? ' la-filerow--dir' : ''}`}
                >
                  <span className="la-fileglyph" />
                  {f.name}
                </span>
              ))}
            </div>

            <pre className="la-code">
              {CODE.map((line, i) => (
                <div className="la-line" key={i}>
                  <span className="la-num">{i + 1}</span>
                  <span className="la-text">
                    {line.map(([kind, text], j) => (
                      <span className={`la-${TOKEN_CLASS[kind]}`} key={j}>{text}</span>
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          </div>

          {/* The integrated terminal, where a real editor keeps it. It is what
              makes this read as an editor rather than as a code sample in a box,
              and it carries the payoff the snippet is building toward. */}
          <div className="la-term">
            <div className="la-tline"><span className="la-prompt">$</span>npm run ship</div>
            <div className="la-tline la-tline--ok"><span className="la-tick-sm" />built in 1.2s · 4 tests passed</div>
            <div className="la-tline la-tline--ok"><span className="la-tick-sm" />live at yourproject.app</div>
            <div className="la-tline"><span className="la-prompt">$</span><span className="la-caret" /></div>
          </div>

          <div className="la-status">
            <span className="la-branch">main</span>
            <span>0 problems</span>
            <span className="la-status-gap" />
            <span>JavaScript</span>
          </div>
        </div>

        {/* Two notes, and each says something the window does not: the review
            that let it ship, and the invoice that followed. A third repeating
            "deployed" would only say the terminal's last line again. */}
        <div className="la-chip la-chip--review">
          <span className="la-tick" />
          <span className="la-chip-title">Mentor approved</span>
        </div>

        <div className="la-chip la-chip--paid">
          <span className="la-chip-mark">&#8377;</span>
          <span>
            <span className="la-chip-title">First invoice paid</span>
            <span className="la-chip-sub">25,000 · 2 days ago</span>
          </span>
        </div>
      </div>
    </div>
  );
}

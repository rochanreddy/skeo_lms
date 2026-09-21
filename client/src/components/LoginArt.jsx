/**
 * The illustration on the sign-in hero: a laptop with an editor open on it,
 * and two white cards floating off its edges.
 *
 * Drawn in markup rather than shipped as an image. The code on the screen is
 * real text, so it stays sharp on every display instead of going soft at 2x
 * like a screenshot would, it costs nothing to download, and it recolours with
 * the theme tokens rather than baking one palette into a PNG that then has to
 * be re-exported whenever the brand moves.
 *
 * Entirely decorative: the hero already says "Build. Learn. Monetize." in
 * text, so this is aria-hidden and a screen reader is told nothing twice.
 */

/* One line of the editor, as tokens. Written as data rather than as nested
   spans in the JSX because the shape of the snippet is the thing worth reading
   here, and thirty <span className="tok-kw"> wrappers bury it. */
const CODE = [
  [['c', '// the whole job, in four lines']],
  [['k', 'const'], ['p', ' ship '], ['o', '= async '], ['o', '('], ['v', 'idea'], ['o', ') => {']],
  [['o', '  '], ['k', 'const'], ['p', ' product '], ['o', '= '], ['k', 'await'], ['f', ' build'], ['o', '('], ['v', 'idea'], ['o', ');']],
  [['o', '  '], ['k', 'await'], ['p', ' product'], ['o', '.'], ['f', 'launch'], ['o', '();']],
  [['o', '  '], ['k', 'return'], ['p', ' product'], ['o', '.'], ['f', 'revenue'], ['o', '();']],
  [['o', '};']],
  [],
  [['c', '// 14 shipped this cohort']],
];

const TOKEN_CLASS = { k: 'kw', f: 'fn', v: 'var', c: 'cm', o: 'op', p: 'pl' };

export default function LoginArt() {
  return (
    <div className="login-art" aria-hidden="true">
      {/* The laptop is tilted in 3D; the cards must not be. So they share a
          stage that is sized and positioned like the laptop but carries no
          transform of its own — inside .la-laptop the cards would tip with the
          screen, and as siblings of .login-art they had no footprint to sit
          against and drifted to the far side of the panel. */}
      <div className="la-stage">
        <div className="la-laptop">
          <div className="la-screen">
            <div className="la-chrome">
              <span className="la-dot" /><span className="la-dot" /><span className="la-dot" />
              <span className="la-file">ship.js</span>
            </div>
            <pre className="la-code">
              {CODE.map((line, i) => (
                <div className="la-line" key={i}>
                  <span className="la-num">{i + 1}</span>
                  <span className="la-text">
                    {line.map(([kind, text], j) => (
                      <span className={`la-t la-${TOKEN_CLASS[kind]}`} key={j}>{text}</span>
                    ))}
                    {/* The caret sits on the last line of the snippet, which is
                        where someone who just typed this would have left it. */}
                    {i === CODE.length - 1 && <span className="la-caret" />}
                  </span>
                </div>
              ))}
            </pre>
          </div>
          {/* The base, seen edge-on. The notch is the trackpad cut-out — without
              it the lid and the body read as two stacked rectangles. */}
          <div className="la-base"><span className="la-notch" /></div>
        </div>

        {/* The white elements. Two, not five: they sit in front of the laptop,
            and each extra one takes a bite out of the thing it is decorating. */}
        <div className="la-card la-card--build">
          <div className="la-card-row">
            <span className="la-tick" />
            <span className="la-card-title">Build passed</span>
          </div>
          <div className="la-card-sub">4 tests · 1.2s</div>
        </div>

        <div className="la-card la-card--live">
          <span className="la-pulse" />
          <div>
            <div className="la-card-title">Deployed</div>
            <div className="la-card-sub">yourproject.app</div>
          </div>
        </div>
      </div>
    </div>
  );
}

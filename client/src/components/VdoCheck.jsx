import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { isReady, loadLibrary, videoProblems } from '../lib/vdoLinks.js';

/**
 * Says which video lessons this VdoCipher account cannot play, and fixes the
 * ones it can match.
 *
 * Linking only changes the tree in the editor. Nothing reaches students until
 * the admin presses Save, the same as every other edit here, so a wrong match
 * costs a click to undo rather than a broken lesson.
 */
export default function VdoCheck({ modules, onLink, onOpen }) {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      setLibrary(await loadLibrary(api));
    } catch (e) {
      setError(e.message || 'The video service did not answer.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  if (error) {
    return (
      <div className="vc vc-warn" role="status">
        <div className="vc-head">
          <div>
            <strong>Could not read the VdoCipher library.</strong>
            <p className="vc-sub">{error} Video lessons may not play until this works. Check VDOCIPHER_API_SECRET on the server.</p>
          </div>
          <button className="btn sm ghost" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Try again'}</button>
        </div>
      </div>
    );
  }
  if (!library) return null;

  const problems = videoProblems(modules, library);
  if (!problems.length) return null;

  const matched = problems.filter((p) => p.match);
  const missing = problems.filter((p) => p.problem === 'missing').length;

  return (
    <div className="vc vc-warn" role="status">
      <div className="vc-head">
        <div>
          <strong>
            {missing
              ? `${missing} video lesson${missing === 1 ? '' : 's'} will not play for students.`
              : `${problems.length} video lesson${problems.length === 1 ? ' has' : 's have'} no video yet.`}
          </strong>
          <p className="vc-sub">
            {missing ? 'They point at videos this VdoCipher account does not have, usually because the key changed. ' : ''}
            {matched.length
              ? `${matched.length} ${matched.length === 1 ? 'has' : 'have'} a video in the library with the same lesson number.`
              : 'None has a video in the library with the same lesson number. Pick each one from the library.'}
          </p>
        </div>
        <div className="vc-actions">
          <button className="btn sm ghost" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check again'}</button>
          {matched.length > 0 && (
            <button className="btn sm" onClick={() => onLink(matched)}>
              Link {matched.length} matching video{matched.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      <ul className="vc-list">
        {problems.map((p) => (
          <li key={`${p.mi}.${p.ci}.${p.ti}`} className="vc-row">
            <button type="button" className="vc-lesson" onClick={() => onOpen(p)} title="Open this lesson">
              {p.lesson}
            </button>
            <span className="vc-why">{p.problem === 'missing' ? 'Not in this account' : 'No video chosen'}</span>
            <span className="vc-match">
              {p.match ? (
                <>
                  <span aria-hidden="true">→ </span>{p.match.title}
                  {!isReady(p.match) && <em className="vc-processing"> still processing</em>}
                </>
              ) : 'No match. Open it and pick from the library.'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

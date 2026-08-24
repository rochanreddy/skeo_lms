// Small inline stroke-icon set for the dock and command palette. Keyed by nav
// label so nav.jsx stays icon-agnostic. Falls back to a dot for anything unmapped.
//
// Paths marked .ico-draw are the icon inner stroke -- the door of the house,
// the lower leaves of the stack, the bottom row of cohorts, the shelves inside
// the folder, the dots inside the bubble. The outer shape always stays put so
// the icon reads as itself the whole time.
// The dock redraws them on hover and when a tab becomes active (see .ico-draw
// in styles.css). pathLength normalises every path to 1 so a single dash length
// animates all of them.
const P = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  home: <><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path className="ico-draw" pathLength="1" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /></>,
  learning: <><path d="M21.5 9 12 4.5 2.5 9 12 13.5z" /><path d="M6 10.8V16c0 1.3 2.7 2.5 6 2.5s6-1.2 6-2.5v-5.2" /><path d="M21.5 9v5" /></>,
  library: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path className="ico-draw" pathLength="1" d="M7.5 12.5h9" /><path className="ico-draw" pathLength="1" d="M7.5 16h5.5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  programs: <><path d="M12 3 3 8l9 5 9-5z" /><path className="ico-draw" pathLength="1" d="M3 12l9 5 9-5" /><path className="ico-draw" pathLength="1" d="M3 16l9 5 9-5" /></>,
  batches: <><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5z" /><path d="M14 4.5A1.5 1.5 0 0 1 15.5 3h4A1.5 1.5 0 0 1 21 4.5v4A1.5 1.5 0 0 1 19.5 10h-4A1.5 1.5 0 0 1 14 8.5z" /><path className="ico-draw" pathLength="1" d="M3 15.5A1.5 1.5 0 0 1 4.5 14h4A1.5 1.5 0 0 1 10 15.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5z" /><path className="ico-draw" pathLength="1" d="M14 15.5A1.5 1.5 0 0 1 15.5 14h4A1.5 1.5 0 0 1 21 15.5v4A1.5 1.5 0 0 1 19.5 21h-4A1.5 1.5 0 0 1 14 19.5z" /></>,
  students: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /><path className="ico-draw" pathLength="1" d="M17 5.2a3.5 3.5 0 0 1 0 6.6" /><path className="ico-draw" pathLength="1" d="M18.5 20c0-2.4-1.2-4.3-3-5.2" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path className="ico-draw" pathLength="1" d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  grades: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 1.5 1.5L14 13" /></>,
  jobs: <><rect x="2.5" y="7" width="19" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path className="ico-draw" pathLength="1" d="M2.5 12h19" /><path className="ico-draw" pathLength="1" d="M10.5 12h3" /></>,
};

const ALIAS = {
  'Home': 'home', 'Learning': 'learning', 'Library': 'library',
  'Profile': 'profile', 'Programs': 'programs', 'Batches': 'batches',
  'Students': 'students', 'Account': 'account', 'Grades': 'grades',
  'Job Board': 'jobs',
};

export default function Icon({ name }) {
  const key = PATHS[name] ? name : ALIAS[name];
  return <svg {...P} aria-hidden="true">{PATHS[key] || <circle cx="12" cy="12" r="3" />}</svg>;
}

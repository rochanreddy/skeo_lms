// The order the course is taught in, which is the order students work through
// their coursework: the weekly assignments first (M01 → M06), then the
// capstone projects 8.1 → 8.5, then anything else. Within a group, by title
// read the way people number things, so "M2" sorts before "M10"; ties fall
// back to when it was set.
//
// Works on assignment documents ({ type, title, createdAt }) and on gradebook
// rows ({ kind, title, at }) alike.
import { capstoneFor } from '../config/rubrics.js';

const byTitle = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const isProject = (x) => x.type === 'project' || x.kind === 'Project';
// Capstones carry their course code (8.1 …); other projects sort after them.
const capstoneRank = (x) => {
  const c = isProject(x) && capstoneFor(x.title);
  return c ? Number(c.code) : 99;
};

export function courseOrder(x, y) {
  return (isProject(x) - isProject(y))
    || (capstoneRank(x) - capstoneRank(y))
    || byTitle.compare(x.title || '', y.title || '')
    || new Date(x.createdAt || x.at || 0) - new Date(y.createdAt || y.at || 0);
}

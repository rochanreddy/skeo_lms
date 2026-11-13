import { Assignment } from '../models/Assignment.js';
import { Counter } from '../models/Counter.js';
import { capstoneFor } from '../config/rubrics.js';

// Each capstone's two PDFs, served by the client from
// client/public/pdfs/capstones/: the project brief (what to build and hand in)
// and the solution brief (how to build it, step by step, with a worked
// example). Both are open to students from the start. Matched by the
// capstone's course code, which config/rubrics.js reads from the title.
const DIR = '/pdfs/capstones';
const NUMBER = { 8.1: '01', 8.2: '02', 8.3: '03', 8.4: '04', 8.5: '05' };

/** The capstone's { pdfUrl, solutionPdfUrl }, or null for anything else. */
export function capstoneBriefs(title) {
  const c = capstoneFor(title);
  const n = c && NUMBER[c.code];
  if (!n) return null;
  return {
    pdfUrl: `${DIR}/skeo-capstone-${n}-project-brief.pdf`,
    solutionPdfUrl: `${DIR}/skeo-capstone-${n}-solution-brief.pdf`,
  };
}

// The course syllabus, which every assignment and project used to open.
const SYLLABUS_PDF = '/pdfs/skeo_Claude_Curriculum.pdf';

/**
 * Once (a marker in skeo_counters), on server start, since the live database
 * is only reachable from the server:
 *   - every capstone project gets its project and solution brief PDFs, the
 *     project brief taking the syllabus's place;
 *   - every assignment stops opening the syllabus PDF (lessons keep it).
 * Once only, so a PDF an admin sets later is not undone by a restart.
 *
 * @returns {Promise<{ skipped?: string, capstones: number, assignments: number }>}
 */
export async function attachCapstoneBriefsOnce() {
  const once = 'coursework-pdfs:2026-11-13';
  if (await Counter.exists({ _id: once })) return { skipped: 'already done', capstones: 0, assignments: 0 };
  let capstones = 0;
  for (const a of await Assignment.find({ type: 'project' })) {
    const briefs = capstoneBriefs(a.title);
    if (!briefs || (a.pdfUrl === briefs.pdfUrl && a.solutionPdfUrl === briefs.solutionPdfUrl)) continue;
    a.pdfUrl = briefs.pdfUrl;
    a.solutionPdfUrl = briefs.solutionPdfUrl;
    await a.save();
    capstones += 1;
  }
  let assignments = 0;
  for (const a of await Assignment.find({ type: 'assignment', pdfUrl: SYLLABUS_PDF })) {
    a.pdfUrl = '';
    await a.save();
    assignments += 1;
  }
  await Counter.updateOne({ _id: once }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  return { capstones, assignments };
}

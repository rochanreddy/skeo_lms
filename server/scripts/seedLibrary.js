// Seed the LMS Library: the Claude curriculum, plus the real resources
// published on menler.in. Only links to PDFs that are actually live.
//   npm run seed:library
import 'dotenv/config';
import { connectDb } from '../db.js';
import { LibraryItem } from '../models/LibraryItem.js';

const BASE = 'https://menler.in/pdfs/';
const link = (file) => BASE + encodeURI(file);
// Served by the client itself (client/public/pdfs/), built by
// scripts/buildCurriculumPdf.js from the same source the course is seeded from.
const CURRICULUM = '/pdfs/skeo_Claude_Curriculum.pdf';

const ITEMS = [
  // ── Library: flagship curated resources ──
  { category: 'Library', title: 'Claude Curriculum', description: 'The full 8-week Claude course — every module, lesson and assignment, plus the capstone menu.', url: CURRICULUM },
  { category: 'Library', title: 'Prompt Library', description: '100+ tested prompts across business, engineering and beginner tracks.', file: 'Menler_100_Prompts_Playbook.pdf' },
  { category: 'Library', title: 'AI Stack Map', description: 'The full map of AI tools and where each fits in your workflow.', file: 'Menler_AI_Stack_Map.pdf' },
  { category: 'Library', title: 'AI Glossary A–Z', description: 'Every AI term you need, explained in plain language.', file: 'Menler_AI_Glossary_AtoZ.pdf' },
  { category: 'Library', title: 'Projects & Connectors Docs', description: 'How to wire Claude Projects and Connectors into your tools.', file: 'Menler_Connector_Projects.pdf' },

  // ── eBook: playbooks + brochures ──
  { category: 'eBook', title: 'Claude Code Playbook', description: 'Build, refactor and ship real code with Claude in your terminal and editor.', file: 'Menler_Claude_Code_Playbook.pdf' },
  { category: 'eBook', title: 'Claude Chat Playbook', description: 'Everyday prompting — research, writing, analysis and fast answers.', file: 'Menler_Claude_Chat_Playbook.pdf' },
  { category: 'eBook', title: 'Claude Cowork Playbook', description: 'Multi-document, multi-step work that turns raw inputs into finished deliverables.', file: 'Menler_Claude_Cowork_Playbook.pdf' },
  { category: 'eBook', title: 'Claude Design Playbook', description: 'Generate visuals, mockups and on-brand design assets with Claude.', file: 'Menler_Claude_Design_Playbook.pdf' },
  { category: 'eBook', title: 'Claude in Microsoft 365', description: 'Use Claude across Word, Excel, PowerPoint and Teams.', file: 'Menler_Claude_Microsoft_Playbook.pdf' },

  // ── Note: practice question banks ──
  { category: 'Note', title: 'AI Engineering — Question Bank', description: 'Practice questions for the AI Engineering track.', file: 'Menler_AIEngineering_Complete_QuestionBank.pdf' },
  { category: 'Note', title: 'AI for Students (Beginner) — Question Bank', description: 'Beginner AI practice questions for students.', file: 'Menler_AIforStudents_Beginner_QuestionBank.pdf' },
  { category: 'Note', title: 'AI for Students (Aware) — Question Bank', description: 'AI-aware practice questions for students.', file: 'Menler_AIforStudents_Aware_QuestionBank.pdf' },
];

async function run() {
  await connectDb();
  // Idempotent: refresh only the items this script owns, leave admin-added
  // ones. Clearing every menler.in item also drops the retired Kickstarter and
  // Generalist resources earlier runs seeded.
  const del = await LibraryItem.deleteMany({ $or: [{ url: /menler\.in\/pdfs\// }, { url: CURRICULUM }] });
  const docs = ITEMS.map((it) => ({ title: it.title, category: it.category, description: it.description, url: it.url || link(it.file) }));
  await LibraryItem.insertMany(docs);
  console.log(`• cleared ${del.deletedCount} old seeded items`);
  console.log(`✓ seeded ${docs.length} Library resources`);
  const byCat = docs.reduce((a, d) => ((a[d.category] = (a[d.category] || 0) + 1), a), {});
  console.log('  by category:', JSON.stringify(byCat));
  console.log('\n✅ Library populated.');
  process.exit(0);
}

run().catch((err) => { console.error('Library seed failed:', err); process.exit(1); });

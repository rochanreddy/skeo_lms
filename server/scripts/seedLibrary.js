// Seed the LMS Library: the Claude curriculum and the skeo playbooks, all
// served by the client itself from client/public/pdfs/, plus the question
// banks still published on menler.in.
//   npm run seed:library
import 'dotenv/config';
import { connectDb } from '../db.js';
import { LibraryItem } from '../models/LibraryItem.js';

const MENLER = 'https://menler.in/pdfs/';
const SKEO = '/pdfs/';
const menler = (file) => MENLER + encodeURI(file);
const skeo = (file) => SKEO + encodeURI(file);

const ITEMS = [
  // ── Library: flagship curated resources ──
  // The curriculum PDF is built by scripts/buildCurriculumPdf.js from the same
  // source the course is seeded from.
  { category: 'Library', title: 'Claude Curriculum', description: 'The full 8-week Claude course — every module, lesson and assignment, plus the capstone menu.', url: skeo('skeo_Claude_Curriculum.pdf') },
  { category: 'Library', title: '100 Prompts Playbook', description: '100+ tested prompts across business, engineering and beginner tracks.', url: skeo('skeo_100_Prompts_Playbook.pdf') },
  { category: 'Library', title: 'AI Stack Map', description: 'The full map of AI tools and where each fits in your workflow.', url: skeo('skeo_AI_Stack_Map.pdf') },
  { category: 'Library', title: 'AI Glossary A–Z', description: 'Every AI term you need, explained in plain language.', url: skeo('skeo_AI_Glossary_AtoZ.pdf') },
  { category: 'Library', title: 'Connector Projects', description: 'How to wire Claude Projects and Connectors into your tools.', url: skeo('skeo_Connector_Projects.pdf') },
  { category: 'Library', title: 'Paid AI Stack Playbook', description: 'Which paid AI tools are worth it, and how to get the most from each.', url: skeo('skeo_Paid_AI_Stack_Playbook.pdf') },

  // ── eBook: the Claude playbooks ──
  { category: 'eBook', title: 'Claude Code Playbook', description: 'Build, refactor and ship real code with Claude in your terminal and editor.', url: skeo('skeo_Claude_Code_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Chat Playbook', description: 'Everyday prompting — research, writing, analysis and fast answers.', url: skeo('skeo_Claude_Chat_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Cowork Playbook', description: 'Multi-document, multi-step work that turns raw inputs into finished deliverables.', url: skeo('skeo_Claude_Cowork_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Design Playbook', description: 'Generate visuals, mockups and on-brand design assets with Claude.', url: skeo('skeo_Claude_Design_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Microsoft Playbook', description: 'Use Claude across Word, Excel, PowerPoint and Teams.', url: skeo('skeo_Claude_Microsoft_Playbook.pdf') },

  // ── Note: practice question banks ──
  { category: 'Note', title: 'AI Engineering — Question Bank', description: 'Practice questions for the AI Engineering track.', url: menler('Menler_AIEngineering_Complete_QuestionBank.pdf') },
  { category: 'Note', title: 'AI for Students (Beginner) — Question Bank', description: 'Beginner AI practice questions for students.', url: menler('Menler_AIforStudents_Beginner_QuestionBank.pdf') },
  { category: 'Note', title: 'AI for Students (Aware) — Question Bank', description: 'AI-aware practice questions for students.', url: menler('Menler_AIforStudents_Aware_QuestionBank.pdf') },
];

async function run() {
  await connectDb();
  // Idempotent: refresh only the items this script owns, leave admin-added
  // ones. Clearing every menler.in item also drops the retired Menler
  // playbooks and the Kickstarter and Generalist resources earlier runs seeded.
  const del = await LibraryItem.deleteMany({
    $or: [{ url: /menler\.in\/pdfs\// }, { url: { $in: ITEMS.map((it) => it.url) } }],
  });
  await LibraryItem.insertMany(ITEMS);
  console.log(`• cleared ${del.deletedCount} old seeded items`);
  console.log(`✓ seeded ${ITEMS.length} Library resources`);
  const byCat = ITEMS.reduce((a, d) => ((a[d.category] = (a[d.category] || 0) + 1), a), {});
  console.log('  by category:', JSON.stringify(byCat));
  console.log('\n✅ Library populated.');
  process.exit(0);
}

run().catch((err) => { console.error('Library seed failed:', err); process.exit(1); });

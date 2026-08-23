// Seed the LMS Library with the real resources published on menler.in.
// Only links to PDFs that are actually live on the marketing site.
//   npm run seed:library
import 'dotenv/config';
import { connectDb } from '../db.js';
import { LibraryItem } from '../models/LibraryItem.js';

const BASE = 'https://menler.in/pdfs/';
const link = (file) => BASE + encodeURI(file);

const ITEMS = [
  // ── Library: flagship curated resources ──
  { category: 'Library', title: 'Prompt Library', description: '100+ tested prompts across business, engineering and beginner tracks.', file: 'Menler_100_Prompts_Playbook.pdf' },
  { category: 'Library', title: 'AI Stack Map', description: 'The full map of AI tools and where each fits in your workflow.', file: 'Menler_AI_Stack_Map.pdf' },
  { category: 'Library', title: 'AI Glossary A–Z', description: 'Every AI term you need, explained in plain language.', file: 'Menler_AI_Glossary_AtoZ.pdf' },
  { category: 'Library', title: 'Projects & Connectors Docs', description: 'How to wire Claude Projects and Connectors into your tools.', file: 'Menler_Connector_Projects.pdf' },
  { category: 'Library', title: 'AI Kickstarter Curriculum', description: 'The full Kickstarter curriculum index — sessions, topics, projects.', file: 'Menler_AI_Kickstarter_Curriculum.pdf' },

  // ── eBook: playbooks + brochures ──
  { category: 'eBook', title: 'Claude Code Playbook', description: 'Build, refactor and ship real code with Claude in your terminal and editor.', file: 'Menler_Claude_Code_Playbook.pdf' },
  { category: 'eBook', title: 'Claude Chat Playbook', description: 'Everyday prompting — research, writing, analysis and fast answers.', file: 'Menler_Claude_Chat_Playbook.pdf' },
  { category: 'eBook', title: 'Claude Cowork Playbook', description: 'Multi-document, multi-step work that turns raw inputs into finished deliverables.', file: 'Menler_Claude_Cowork_Playbook.pdf' },
  { category: 'eBook', title: 'Claude Design Playbook', description: 'Generate visuals, mockups and on-brand design assets with Claude.', file: 'Menler_Claude_Design_Playbook.pdf' },
  { category: 'eBook', title: 'Claude in Microsoft 365', description: 'Use Claude across Word, Excel, PowerPoint and Teams.', file: 'Menler_Claude_Microsoft_Playbook.pdf' },
  { category: 'eBook', title: 'AI Kickstarter Brochure', description: 'Everything about the Gen AI Kickstarter program.', file: '1_updated_Menler AI Kickstarter Brochure_2026.pdf' },
  { category: 'eBook', title: 'Claude Generalist Brochure', description: 'The Claude AI Generalist Fellowship overview.', file: 'Menler_Claude_Gen_brochure.pdf' },

  // ── Note: practice question banks ──
  { category: 'Note', title: 'AI Engineering — Question Bank', description: 'Practice questions for the AI Engineering track.', file: 'Menler_AIEngineering_Complete_QuestionBank.pdf' },
  { category: 'Note', title: 'AI Generalist (Entry) — Question Bank', description: 'Entry-level AI Generalist practice questions.', file: 'Menler_AIGeneralist_Entry_QuestionBank.pdf' },
  { category: 'Note', title: 'AI Generalist (Level-Up) — Question Bank', description: 'Advanced AI Generalist practice questions.', file: 'Menler_AIGeneralist_LevelUp_QuestionBank.pdf' },
  { category: 'Note', title: 'AI for Students (Beginner) — Question Bank', description: 'Beginner AI practice questions for students.', file: 'Menler_AIforStudents_Beginner_QuestionBank.pdf' },
  { category: 'Note', title: 'AI for Students (Aware) — Question Bank', description: 'AI-aware practice questions for students.', file: 'Menler_AIforStudents_Aware_QuestionBank.pdf' },
];

async function run() {
  await connectDb();
  // Idempotent: refresh only the menler.in-sourced items, leave admin-added ones.
  const del = await LibraryItem.deleteMany({ url: /menler\.in\/pdfs\// });
  const docs = ITEMS.map((it) => ({ title: it.title, category: it.category, description: it.description, url: link(it.file) }));
  await LibraryItem.insertMany(docs);
  console.log(`• cleared ${del.deletedCount} old menler.in items`);
  console.log(`✓ seeded ${docs.length} Library resources from menler.in`);
  const byCat = docs.reduce((a, d) => ((a[d.category] = (a[d.category] || 0) + 1), a), {});
  console.log('  by category:', JSON.stringify(byCat));
  console.log('\n✅ Library populated.');
  process.exit(0);
}

run().catch((err) => { console.error('Library seed failed:', err); process.exit(1); });

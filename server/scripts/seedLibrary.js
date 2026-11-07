// Seed the LMS Library: the Claude curriculum and the skeo playbooks.
//   npm run seed:library
//
// The curriculum is free and served by the client itself (client/public/pdfs,
// built by scripts/buildCurriculumPdf.js). The playbooks are paid: they stay on
// the server in assets/playbooks — the same files the purchase mail attaches —
// and the Library serves each one only to a buyer of its set (routes/library.js).
import 'dotenv/config';
import { connectDb } from '../db.js';
import { LibraryItem } from '../models/LibraryItem.js';

const CURRICULUM = '/pdfs/skeo_Claude_Curriculum.pdf';
// An API path, not a link: the client fetches it with the user's token.
const playbook = (set, file) => ({ playbookSet: set, url: `/library/playbooks/${set}/${encodeURIComponent(file)}` });

const ITEMS = [
  // ── Library: flagship curated resources ──
  { category: 'Library', title: 'Claude Curriculum', description: 'The full 8-week Claude course — every module, lesson and assignment, plus the capstone menu.', url: CURRICULUM },

  // ── AI Library (₹99, or Everything AI) ──
  { category: 'Library', title: '100 Prompts Playbook', description: '100+ tested prompts across business, engineering and beginner tracks.', ...playbook('ai', 'skeo_100_Prompts_Playbook.pdf') },
  { category: 'Library', title: 'AI Stack Map', description: 'The full map of AI tools and where each fits in your workflow.', ...playbook('ai', 'skeo_AI_Stack_Map.pdf') },
  { category: 'Library', title: 'AI Glossary A–Z', description: 'Every AI term you need, explained in plain language.', ...playbook('ai', 'skeo_AI_Glossary_AtoZ.pdf') },
  { category: 'Library', title: 'Connector Projects', description: 'How to wire Claude Projects and Connectors into your tools.', ...playbook('ai', 'skeo_Connector_Projects.pdf') },
  { category: 'Library', title: 'Paid AI Stack Playbook', description: 'Which paid AI tools are worth it, and how to get the most from each.', ...playbook('ai', 'skeo_Paid_AI_Stack_Playbook.pdf') },

  // ── Claude Playbooks (₹99, or Everything AI) ──
  { category: 'eBook', title: 'Claude Code Playbook', description: 'Build, refactor and ship real code with Claude in your terminal and editor.', ...playbook('claude', 'skeo_Claude_Code_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Chat Playbook', description: 'Everyday prompting — research, writing, analysis and fast answers.', ...playbook('claude', 'skeo_Claude_Chat_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Cowork Playbook', description: 'Multi-document, multi-step work that turns raw inputs into finished deliverables.', ...playbook('claude', 'skeo_Claude_Cowork_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Design Playbook', description: 'Generate visuals, mockups and on-brand design assets with Claude.', ...playbook('claude', 'skeo_Claude_Design_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Microsoft Playbook', description: 'Use Claude across Word, Excel, PowerPoint and Teams.', ...playbook('claude', 'skeo_Claude_Microsoft_Playbook.pdf') },
];

async function run() {
  await connectDb();
  // Idempotent: refresh only the items this script owns, leave admin-added
  // ones. Also clears what earlier runs seeded: every menler.in link (the
  // Menler playbooks, question banks, Kickstarter and Generalist resources)
  // and the skeo playbooks briefly served as public files.
  const del = await LibraryItem.deleteMany({
    $or: [
      { url: /menler\.in\/pdfs\// },
      { url: /^\/pdfs\/skeo_/ },
      { playbookSet: { $in: ['claude', 'ai'] } },
      { url: { $in: ITEMS.map((it) => it.url) } },
    ],
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

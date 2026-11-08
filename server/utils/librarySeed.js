import { LibraryItem } from '../models/LibraryItem.js';

/**
 * The Library resources skeo itself provides: the skeo playbooks.
 *
 * They are paid: they stay on the server in assets/playbooks, the same files
 * the purchase mail attaches, and the Library serves each one only to a buyer
 * of its set (routes/library.js).
 *
 * The Claude curriculum PDF is deliberately not listed: it lives on as the
 * lessons' reading (scripts/seedClaude.js), but not as a Library card.
 *
 * Applied on every server start (syncLibrary below), so changing this list and
 * deploying is all it takes to change the live Library, no one has to run a
 * script against the production database by hand.
 */
// An API path, not a link: the client fetches it with the user's token.
const playbook = (set, file) => ({ playbookSet: set, url: `/library/playbooks/${set}/${encodeURIComponent(file)}` });

export const LIBRARY_ITEMS = [
  // ── AI Library (₹99, or Everything AI) ──
  { category: 'Library', title: '100 Prompts Playbook', description: '100+ tested prompts across business, engineering and beginner tracks.', ...playbook('ai', 'skeo_100_Prompts_Playbook.pdf') },
  { category: 'Library', title: 'AI Stack Map', description: 'The full map of AI tools and where each fits in your workflow.', ...playbook('ai', 'skeo_AI_Stack_Map.pdf') },
  { category: 'Library', title: 'AI Glossary A–Z', description: 'Every AI term you need, explained in plain language.', ...playbook('ai', 'skeo_AI_Glossary_AtoZ.pdf') },
  { category: 'Library', title: 'Connector Projects', description: 'How to wire Claude Projects and Connectors into your tools.', ...playbook('ai', 'skeo_Connector_Projects.pdf') },
  { category: 'Library', title: 'Paid AI Stack Playbook', description: 'Which paid AI tools are worth it, and how to get the most from each.', ...playbook('ai', 'skeo_Paid_AI_Stack_Playbook.pdf') },

  // ── Claude Playbooks (₹99, or Everything AI) ──
  { category: 'eBook', title: 'Claude Code Playbook', description: 'Build, refactor and ship real code with Claude in your terminal and editor.', ...playbook('claude', 'skeo_Claude_Code_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Chat Playbook', description: 'Everyday prompting: research, writing, analysis and fast answers.', ...playbook('claude', 'skeo_Claude_Chat_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Cowork Playbook', description: 'Multi-document, multi-step work that turns raw inputs into finished deliverables.', ...playbook('claude', 'skeo_Claude_Cowork_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Design Playbook', description: 'Generate visuals, mockups and on-brand design assets with Claude.', ...playbook('claude', 'skeo_Claude_Design_Playbook.pdf') },
  { category: 'eBook', title: 'Claude Microsoft Playbook', description: 'Use Claude across Word, Excel, PowerPoint and Teams.', ...playbook('claude', 'skeo_Claude_Microsoft_Playbook.pdf') },
];

// What this module owns in the collection: the items above, plus everything
// earlier seeds put there, every menler.in link (the Menler playbooks,
// question banks, Kickstarter and Generalist resources), the retired Claude
// curriculum card, and the skeo playbooks briefly served as public files.
// Anything an admin added is left alone.
const OWNED = {
  $or: [
    { url: /menler\.in\/pdfs\// },
    { url: /^\/pdfs\/skeo_/ },
    { playbookSet: { $in: ['claude', 'ai'] } },
    { url: { $in: LIBRARY_ITEMS.map((it) => it.url) } },
  ],
};

const FIELDS = ['category', 'title', 'description', 'url', 'playbookSet'];
const key = (it) => FIELDS.map((f) => it[f] || '').join('\u0000');

/**
 * Make the collection hold exactly LIBRARY_ITEMS among the items this module
 * owns. A no-op when it already does, which is every start but the first
 * after a change: so items keep their createdAt and the Library its order.
 */
export async function syncLibrary() {
  const existing = await LibraryItem.find(OWNED).lean();
  const want = LIBRARY_ITEMS.map(key).sort();
  const have = existing.map(key).sort();
  if (want.length === have.length && want.every((k, i) => k === have[i])) {
    return { changed: false, removed: 0, added: 0 };
  }
  const { deletedCount } = await LibraryItem.deleteMany(OWNED);
  await LibraryItem.insertMany(LIBRARY_ITEMS);
  return { changed: true, removed: deletedCount, added: LIBRARY_ITEMS.length };
}

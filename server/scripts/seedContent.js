// Seed the real Menler AI Kickstarter curriculum into the Learning tree
// (Program → Module → Chapter → Topic), from the official Curriculum Index /
// Detailed Lesson Plan. 4 sessions · 19 topics · 4 portfolio projects.
//   npm run seed:content
import 'dotenv/config';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';

// Each session → Module. Each topic → Chapter. Within a chapter: a "What's
// covered" topic + the topic's Assignment (+ its Project where one is attached).
const SESSIONS = [
  {
    session: 'S01 · AI Foundations + Claude OS',
    topics: [
      {
        code: '1.1', time: '35 min', title: 'The AI Landscape — What You Actually Need to Know',
        covered: [
          'AI vs Machine Learning vs Generative AI — the 3-level distinction',
          'What is an LLM? The simple mental model: autocomplete at civilisation scale',
          'Tokens, context windows, and why they determine what Claude can and cannot do',
          'Hallucinations: what causes them, how to detect them, when to trust the output',
          'AI limitations that matter: no real-time data, no memory across sessions (default), no judgement',
          'Why 2024–26 is the operator moment: tools are ready, most people are not using them well',
        ],
        assignment: { name: 'AI Audit — Where Does AI Already Touch Your Life?', body: '1. List 10 tools/products you use daily; mark which use AI.\n2. Pick one, read how it works, write 3 sentences in plain language.\n3. Ask Claude to explain how it works to someone who has never heard of an LLM; critique the answer.\n4. Find one public LLM hallucination, screenshot it, note why it happened.\nSubmit: Discord post — 3 bullets + 1 screenshot, under 100 words.' },
      },
      {
        code: '1.2', time: '25 min', title: 'Claude OS — Three Interfaces, Three Use Cases',
        covered: [
          'Claude Chat: conversational reasoning, analysis, writing, long-context Q&A',
          'Claude Cowork: persistent workspace, collaboration mode, shared context across tasks',
          'Claude Code: code generation, debugging, vibe coding, technical workflows',
          'Claude Artifacts: live documents, code snippets, SVGs — outputs you can use directly',
          'Claude Projects: memory, custom instructions, uploaded knowledge — persistent AI context',
          'When to use which interface — the decision tree every operator needs',
        ],
        assignment: { name: 'Interface Comparison Drill', body: 'Take one real task. Run it through Claude Chat (screenshot), then Claude Cowork (screenshot). Write a 3-sentence comparison: which gave better results and why. Bonus: identify your default interface.\nSubmit: Claude Artifact — 1 page, 3 screenshots embedded.' },
      },
      {
        code: '1.3', time: '25 min', title: 'Prompting Fundamentals — The CLEAR Framework',
        covered: [
          'Why vague prompts produce vague outputs — the garbage-in rule',
          'The CLEAR framework: Context · Length · Examples · Audience · Result',
          'Role prompting: when it works and when it does not',
          'Constraints as quality levers: word limits, format instructions, tone directives',
          'Chain prompting: breaking complex tasks into sequential steps',
          'Iterative refinement: treating Claude as a collaborator, not a one-shot machine',
          'What NOT to do: over-prompting, under-specifying, prompt injection risks',
        ],
        assignment: { name: 'Prompt Rewrite Battle + Personal Prompt Library', body: 'Take 5 prompts; rewrite each using CLEAR; show before/after. Run both versions for 2 prompts; compare outputs. Build a Prompt Cheat Sheet: 10+ prompts organised by category (writing, research, analysis, planning, coding).\nSubmit: Claude Artifact — Prompt Cheat Sheet. Becomes a portfolio asset.' },
      },
      {
        code: '1.4', time: '20 min', title: 'AI Workflow Thinking — From Task to System',
        covered: [
          'What is an AI workflow? Input → Process → Output → Action',
          'Mapping your work into AI-ready tasks: what can be delegated, what cannot',
          'Workflow thinking vs tool thinking: systems over individual prompts',
          'The 3-task method: pick 3 recurring tasks and redesign each with Claude at the centre',
          'Documenting your workflow as a reusable Artifact — the first step to a portfolio',
        ],
        assignment: { name: 'AI Workflow Map — Session 01 Deliverable', body: 'Identify 3 recurring tasks. For each: write the current process, then redesign with Claude in the loop. Map visually: Input → Claude step → Output → Action. Estimate weekly time saved. Post to Discord and get 2 peer comments before Session 02.\nSubmit: Claude Artifact — 1-page workflow map.' },
      },
    ],
  },
  {
    session: 'S02 · Claude Power Layer: Skills, Connectors, Intelligence & Creatives',
    topics: [
      {
        code: '2.1', time: '35 min', title: 'Claude Skills — Teaching Claude to Behave Differently',
        covered: [
          'What are Claude Skills? Custom instruction sets that change how Claude responds',
          'Built-in skills vs user-defined skills — the difference in practice',
          'Writing skill instructions: format, tone, domain and output-structure rules',
          'Stacking skills inside a Claude Project: how multiple skills interact',
          'Use case: a skill that always formats output as a Notion-ready document',
          'Use case: a skill that responds only with actionable bullet points, no preamble',
        ],
        assignment: { name: 'Build Your First Custom Skill', body: 'Identify one output type you produce often. Write a Skill instruction set: 5–8 rules defining format and style. Test it — screenshot before/after (skill active). Run 3 inputs; refine until consistent. Add to your Claude Project.\nSubmit: skill instructions + 2 before/after screenshots (#prompt-library). Feeds into Project 01.' },
      },
      {
        code: '2.2', time: '40 min', title: 'Claude Connectors — Claude Inside Your Existing Tools',
        covered: [
          'What are Claude Connectors? Native integrations that give Claude access to your data',
          'Google Drive Connector: ask Claude about files without copy-pasting',
          'Gmail Connector: draft replies, summarise threads, flag priority emails',
          'Notion Connector: query notes, summarise pages, build from your knowledge base',
          'How Connectors change output quality — context beats prompting alone',
          'Privacy and permissions: what Claude can access, what it cannot, how to control it',
          'Connector vs API: when you need a Connector and when you need to build something',
        ],
        assignment: { name: 'One Connector, One Real Task', body: 'Connect Claude to one tool you already use. Give it a task that requires reading from that source — no copy-paste. Document the task, prompt and output. Write one sentence: "Before Connectors this took ___ minutes. Now ___."\nSubmit: 1 screenshot + 1-sentence time comparison. Feeds into Project 01.' },
      },
      {
        code: '2.3', time: '45 min', title: 'Claude Projects — Building a Persistent Intelligence System',
        covered: [
          'Projects vs conversations: why session memory changes everything',
          'Project architecture: system prompt + skills + knowledge docs + connector access',
          'Writing an effective Project system prompt: persona, context, constraints, output rules',
          'Uploading knowledge documents: your own notes, SOPs, research, company context',
          'Project personas: "You are my senior research analyst who knows my domain"',
          'Managing multiple Projects: one per role, domain, or workflow context',
          'Projects as the foundation for automation: Sessions 03 and 04 build on top of this',
        ],
        assignment: { name: 'Connected Claude Workspace — Session 02 Deliverable', body: 'Create a Claude Project. Write a system prompt (150+ words). Add one Skill (2.1). Upload one knowledge document. Connect one Connector (2.2). Run 3 real tasks; document results.\nSubmit: Claude Artifact — Project Setup Summary.' },
        project: { name: 'PROJECT 01 — Personal AI Operating System', body: 'A fully configured Claude workspace personalised to your role, domain and recurring tasks. Must complete 3 of your real weekly tasks without switching apps or copy-pasting.' },
      },
      {
        code: '2.4', time: '55 min', title: 'Research Intelligence — Claude + Perplexity + NotebookLM',
        covered: [
          'The research stack: why one tool is never enough',
          'Perplexity AI: real-time web research with citations — when to use it over Claude',
          'NotebookLM: uploading source documents and interrogating them directly',
          'Claude as the synthesis layer: Perplexity findings + NotebookLM extracts → insight',
          'The pipeline: Question → Perplexity → NotebookLM → Claude (synthesis + output)',
          'Evaluating AI research output: cross-referencing, spotting gaps, adding human judgement',
          'Building a research brief in under 30 minutes using the full stack',
        ],
        assignment: { name: 'Research Intelligence Pipeline', body: 'Pick a topic. Step 1 — Perplexity: 3 queries, screenshot top 3 results with citations. Step 2 — NotebookLM: upload 2 documents, ask 5 questions. Step 3 — Claude: synthesise into a 300-word insight brief with 3 recommendations. Evaluate what AI got right vs what needed judgement.\nSubmit: Claude Artifact — 1-page Research Brief with source trail. Feeds into Project 02.' },
      },
      {
        code: '2.5', time: '50 min', title: 'AI Creatives — Image, Audio & Video Generation',
        covered: [
          'How diffusion models work: diffusion in plain language, no maths required',
          'Prompt engineering for visuals: subject, style, lighting, composition, aspect ratio, negative prompts',
          'Midjourney vs DALL-E 3 vs Adobe Firefly vs Ideogram — when to use which',
          'Using Claude to write better image prompts: intent → Claude prompt → image tool',
          'AI audio: voice cloning with ElevenLabs, TTS, podcast and narration workflows',
          'AI video: Runway Gen-3 and Sora for short-form, Pictory for text-to-video',
          'Canva AI and Adobe Firefly inside tools professionals already use',
          'Copyright, ownership, and ethical use of AI-generated creative output',
        ],
        assignment: { name: 'Build a Creative Asset Set', body: 'Choose a real brief (social post, podcast intro, product banner, explainer). Image: Claude writes prompt → Midjourney/DALL-E 3, iterate 3×. Audio: ElevenLabs 30-sec narration from a Claude script. Combine in Canva AI or Gamma. Reflect on where AI delivered vs where you directed it.\nSubmit: final creative asset + the Claude prompt used for each step.' },
      },
    ],
  },
  {
    session: 'S03 · Schedules, Routines, Workflows & Automation Systems',
    topics: [
      {
        code: '3.1', time: '40 min', title: 'Claude Schedules — Time-Triggered Intelligence',
        covered: [
          'What is a Claude Schedule? Time-triggered prompts that run automatically',
          'Schedule anatomy: trigger time + prompt + output destination',
          'Use case: daily morning brief — news digest, calendar summary, priority 3 tasks',
          'Use case: weekly review digest — what happened, what is next, what to decide',
          'Use case: automated report runner — pull data context, generate summary, send',
          'How to write a Schedule prompt: self-contained, context-rich, output-specific',
          'Limitations: what Schedules cannot do without a Connector feeding live data',
        ],
        assignment: { name: 'Build and Run Your Morning Brief Schedule', body: 'Design a Morning Brief Schedule for your context. Write the prompt (what you want each morning, format, what you will do with it). Run it 3 consecutive days. After Day 1: score /10 and edit. After Day 3: write a 3-sentence reflection.\nSubmit: Day 1 and Day 3 outputs side by side. Feeds into Project 03.' },
      },
      {
        code: '3.2', time: '35 min', title: 'Claude Routines — On-Demand Repeatable Workflows',
        covered: [
          'Routines vs Schedules: on-demand trigger vs time trigger',
          'What makes a good Routine: a task done more than twice a week following a pattern',
          'Routine anatomy: input template + multi-step prompt chain + output format',
          'Use case: Meeting Prep Routine — agenda in, briefing doc out',
          'Use case: Content Repurpose Routine — long-form in, 5 formats out',
          'Use case: Decision Analysis Routine — situation in, pros/cons/recommendation out',
          'Building Routines inside a Claude Project so they inherit your context',
        ],
        assignment: { name: 'Build 2 Routines for Real Tasks', body: 'Identify 2 recurring tasks that follow a pattern. For each: write an input template and a Routine prompt. Run with 2 real inputs; test for consistency; refine after the first run. Add both to your Claude Project.\nSubmit: Routine prompts + 1 sample output each. Feeds into Project 03.' },
      },
      {
        code: '3.3', time: '40 min', title: 'Claude for Data — Upload, Interrogate, Act',
        covered: [
          'What Claude can do with data: CSV uploads, table reading, pattern spotting, summaries',
          'How to frame a data question: what you have, what you want to know, what decision it serves',
          'Analytical prompting: "Find the top 3 anomalies" vs "Summarise this"',
          'Use case: expense data → category breakdown → savings recommendation',
          'Use case: survey results → theme extraction → 3 key findings',
          'Use case: sales pipeline → win/loss patterns → next action priorities',
          'Limitations: Claude reads and reasons, not computes — when to use Excel/Sheets AI',
        ],
        assignment: { name: 'Data Interrogation — 5 Questions, 1 Action', body: 'Find a real dataset. Upload to Claude; ask 5 specific analytical questions. From the answers, identify 1 insight you would not have noticed. Turn it into a 1-paragraph action plan. Build a Data Insight Brief (dataset description, 5 Q&A pairs, 1 insight, 1 action).\nSubmit: Claude Artifact — Data Insight Brief.' },
      },
      {
        code: '3.4', time: '55 min', title: 'External Automation — Zapier, n8n & When to Leave Claude',
        covered: [
          'The Claude-first rule: exhaust native tools before going external',
          'When external automation is necessary: multi-app triggers, live feeds, output to other platforms',
          'Zapier anatomy: Trigger → Action → Claude step → Output',
          'n8n vs Zapier: open source vs hosted, complexity ceiling, Indian pricing',
          'Designing automation logic before building it: flowchart first, tool second',
          'Use cases: Google Form → Notion; email → Gmail draft; calendar → WhatsApp/Telegram',
          'Testing and debugging automations: what breaks and how to fix it',
        ],
        assignment: { name: 'Design + Ship One External Automation — Session 03 Deliverable', body: 'Design on paper: Trigger → Claude step (exact prompt) → Output destination. Build in Zapier (free tier) or n8n using the Claude action. Trigger 3× with real inputs; screenshot all 3. Evaluate accuracy; document name, problem, time saved.\nSubmit: Live Automation System — Schedule + Routine + External Zap in one Artifact.' },
        project: { name: 'PROJECT 03 — Automation Suite', body: 'Three automation systems (Schedule + Routine + external Zap) that collectively save at least 2 hours per week, each run 3× and evaluated for consistency.' },
      },
    ],
  },
  {
    session: 'S04 · Build Sprint, Portfolio & Demo Day',
    topics: [
      {
        code: '4.1', time: '65 min', title: 'Vibe Coding — Build Real Things Without Writing Code',
        covered: [
          'What is vibe coding? The shift from describing intent to iterating on output',
          'The vibe coding loop: describe → generate → test → refine → ship',
          'Claude Code as your primary build partner: framing requests, giving feedback, unsticking yourself',
          'Lovable: describe an app in plain English, get a working React frontend in minutes',
          'Bolt.new: full-stack app from a single prompt — databases, auth and UI included',
          'Replit AI: browser-based development with AI pair programming — no local setup',
          'v0 by Vercel: UI component generation from text → production-ready code',
          'When vibe coding works (MVPs, internal tools, dashboards) and when it breaks down',
        ],
        assignment: { name: 'Vibe Code Something Real in Under 30 Minutes', body: 'Pick a small, specific tool you have always wanted. Open Lovable or Bolt.new; write a specific first prompt. Iterate at least 3× (note what changed + the exact prompt). Share the live URL with one person outside the cohort; get written feedback.\nSubmit: live URL + 3 iteration prompts + 1 line of external feedback. Feeds into Project 04.' },
      },
      {
        code: '4.2', time: '20 min', title: 'Capstone Build Sprint — Ship in 20 Minutes',
        covered: [
          'Capstone options: AI Research System · Connected Workflow Engine · Automation Suite · Vibe-coded AI Tool',
          'Build criteria: must use Claude + at least 2 other tools · solve a real problem · be publicly shareable',
          'The 20-minute sprint framework: what to finish, what to cut, what to defer',
          'Combining your Session 01–03 deliverables into a unified capstone narrative',
        ],
        assignment: { name: 'Capstone Project — Final Polish', body: 'Finalise your capstone (must incorporate at least one Artifact, one workflow and one automation from Sessions 01–03). Record a 90-second Loom walkthrough (problem → Claude solving it → output; live demo, no slides). Write a 3-sentence summary. Publish via a public URL.\nSubmit before Demo Day.' },
        project: { name: 'PROJECT 04 — Capstone', body: 'An AI-powered solution to a real problem, Claude at the core + 2 other tools, usable by someone else, shareable via public URL, demoable in 3 minutes.' },
      },
      {
        code: '4.3', time: '40 min', title: 'Demo Day — Present, Critique, Level Up',
        covered: [
          'Demo structure: Problem (30s) → Solution (60s) → Live demo (2 min) → Result + metric (30s)',
          'Peer feedback protocol: 1 thing that worked · 1 thing to improve · 1 question',
          'Evaluating AI work: how to talk about your process, not just your output',
          'What makes a strong AI portfolio piece: specificity, real input, measurable outcome',
          'How to handle questions about your AI workflow in a job or client context',
        ],
        assignment: { name: 'Post-Demo LinkedIn Post', body: 'Write a LinkedIn post: Hook (1 line) · Problem solved (2) · How you used AI (3) · Result/learning (2) · CTA (1). Tag Menler AI Kickstarter Program; hashtags #AILiteracy #MenlerAIKickstarter #GenerativeAI. Attach your Loom link or a screenshot. Post within 48 hours of Demo Day.\nSubmit: live LinkedIn post URL.' },
      },
      {
        code: '4.4', time: '45 min', title: 'AI-Native Career Positioning',
        covered: [
          'What "AI-native" means on a resume vs what it means in practice',
          'How to articulate AI skills without sounding generic: specificity is credibility',
          'Resume language: before and after for 3 common job roles',
          'LinkedIn About section: the AI practitioner framing — tools used + outcomes produced',
          'Building a portfolio page: what to include, what to cut, how to make it scannable',
          'AI skills as proof-of-work, not proof-of-title: show workflows, not certifications',
          'Interview questions about AI: how to answer "How do you use AI in your work?"',
        ],
        assignment: { name: 'AI-Native Profile Update', body: 'Rewrite your LinkedIn headline to include one specific AI skill/tool. Rewrite your About section (3–5 sentences): domain + how you use AI + one outcome. Update/create a portfolio page (Notion/Gamma/LinkedIn Featured) with 3 deliverables: Workflow Map · Connected Workspace · Automation System. Use Claude to write and refine; share your prompts.\nSubmit: screenshot of updated headline + About section.' },
      },
    ],
  },
];

const PROJECTS = [
  { code: 'P01', name: 'Personal AI Operating System', tools: 'Claude Chat · Projects · Skills · Connectors · Artifacts',
    brief: 'Design and build a fully configured Claude workspace personalised to your role, domain and recurring tasks — an AI-powered operating layer, not a chatbot. Must complete 3 real weekly tasks without switching apps or copy-pasting.',
    deliverables: ['Claude Project: system prompt (150+ words) + 2 Skill sets + 1 Connector + 1 knowledge doc', 'Claude Artifact: Project Setup Summary — what it does, what it knows, how to trigger it', '3 real task completions documented with prompt + output screenshots', 'Time comparison: estimated hours saved per week vs manual'],
    stretch: 'Add a second Connector and a third Skill. Test the workspace with someone else’s task to verify it generalises.' },
  { code: 'P02', name: 'AI Research Intelligence System', tools: 'Claude · Perplexity AI · NotebookLM · Projects · Artifacts',
    brief: 'Build a repeatable research pipeline: Claude as synthesis engine, Perplexity for live web intelligence, NotebookLM for source interrogation. Documented well enough that another person could run it. Run on a real question that matters to your career or studies.',
    deliverables: ['Research pipeline documentation: step-by-step process, tools, prompts, expected outputs per stage', 'Live research brief: 400–500 words, cited, with 3 recommendations', 'Prompt templates for each stage (Perplexity query, NotebookLM frames, Claude synthesis)', 'Reflection note: what AI got right, what needed judgement, what was missing'],
    stretch: 'Run the pipeline for 3 different topics. Package as a shareable Notion template.' },
  { code: 'P03', name: 'Automation Suite — 3 Systems Running in Parallel', tools: 'Claude Schedules · Routines · Projects · Zapier / n8n · Google Workspace',
    brief: 'Design and ship three automation systems that collectively save at least 2 hours per week — a Schedule (time-triggered), a Routine (on-demand), and an external Zap (connects Claude to an app you use). Each run 3× and evaluated for consistency.',
    deliverables: ['Claude Schedule: live and running, with Day 1 and Day 3 outputs showing prompt evolution', 'Two Claude Routines: input templates + prompt chains + 2 sample outputs each', 'One external Zap/n8n flow: trigger, Claude step prompt, output destination', 'Automation Stack Map: all 3 systems, the problem each solves, estimated time saved'],
    stretch: 'Chain the Schedule and the Zap into a fully automated weekly intelligence loop.' },
  { code: 'P04', name: 'Capstone — AI-Powered Solution for a Real Problem', tools: 'Any combination from Sessions 01–03 · Claude Code / Lovable / Bolt (optional)',
    brief: 'Identify a real problem in your work, studies, community or industry. Build an AI-powered solution with Claude at the core and at least two other tools. Must be usable by someone other than you, shareable via a public URL, and demoable in 3 minutes. Evaluated on specificity and clarity, not complexity.',
    deliverables: ['Working solution accessible via public URL (Notion, Gamma, Artifact, Lovable app, or GitHub)', '90-second Loom demo: problem → Claude solution → output (live, no slides)', 'Project brief (300 words): problem, tools, how Claude is central, outcome', 'LinkedIn post published within 48 hours of Demo Day'],
    stretch: 'Present your capstone to someone outside the cohort — a manager, client or professor. Document their feedback.' },
];

function buildModules() {
  const modules = SESSIONS.map((s, i) => ({
    title: s.session,
    order: i,
    chapters: s.topics.map((t, ci) => ({
      title: `${t.code} · ${t.title} · ${t.time}`,
      order: ci,
      topics: [
        { title: "What's covered", contentType: 'text', body: t.covered.map((x) => `• ${x}`).join('\n'), order: 0 },
        { title: `Assignment — ${t.assignment.name}`, contentType: 'text', body: t.assignment.body, order: 1 },
        ...(t.project ? [{ title: t.project.name, contentType: 'text', body: t.project.body, order: 2 }] : []),
      ],
    })),
  }));
  // Portfolio projects as a final module.
  modules.push({
    title: 'Portfolio Projects — All 4',
    order: SESSIONS.length,
    chapters: PROJECTS.map((p, i) => ({
      title: `${p.code} · ${p.name}`,
      order: i,
      topics: [
        { title: 'Tools', contentType: 'text', body: p.tools, order: 0 },
        { title: 'Project brief', contentType: 'text', body: p.brief, order: 1 },
        { title: 'Deliverables', contentType: 'text', body: p.deliverables.map((x) => `• ${x}`).join('\n'), order: 2 },
        { title: 'Stretch goal', contentType: 'text', body: p.stretch, order: 3 },
      ],
    })),
  });
  return modules;
}

async function run() {
  await connectDb();
  const modules = buildModules();
  const topicCount = modules.reduce((n, m) => n + m.chapters.reduce((c, ch) => c + ch.topics.length, 0), 0);
  for (const title of ['Kickstarter', 'Fellowship']) {
    let program = await Program.findOne({ title });
    if (!program) program = await Program.create({ title, type: 'cohort', published: true });
    program.modules = modules;
    program.published = true;
    program.description = 'Menler AI Kickstarter — 4 sessions, 19 topics, 4 portfolio projects.';
    await program.save();
    console.log(`✓ ${title}: ${modules.length} modules · ${modules.reduce((n, m) => n + m.chapters.length, 0)} chapters · ${topicCount} topics`);
  }
  console.log('\n✅ AI Kickstarter curriculum seeded into Learning.');
  process.exit(0);
}

run().catch((err) => { console.error('Content seed failed:', err); process.exit(1); });

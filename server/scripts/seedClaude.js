// Seed the "Claude" programme — the only programme in the LMS.
//
// Replaces the retired Kickstarter / Fellowship programmes with one 8-module
// course, and creates one gate quiz per module. A student must ATTEMPT a
// module's quiz before the next module unlocks (see client Learning.jsx).
//
// Every lesson carries a video (played inline) and a PDF (opened in the
// in-page viewer) — those two surfaces only.
//   npm run seed:claude
import 'dotenv/config';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';

// Stand-in media so the flow is clickable end to end. Swap per lesson later.
const VIDEO = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4';
const PDF = 'https://menler.in/pdfs/Menler_AI_Kickstarter_Curriculum.pdf';

// ── The course ────────────────────────────────────────────────────────────
// module → lessons[] → { code, title, points[], assignment? }
const MODULES = [
  {
    title: 'M01 · Foundations — How AI and Claude Actually Work',
    lessons: [
      { code: '1.1', title: 'What Generative AI Actually Is', points: [
        'Claude predicts the next likely piece of text based on patterns learned from huge amounts of data, not facts pulled from a database',
        "Fluency (sounding right) and accuracy (being right) are separate properties — one doesn't guarantee the other",
        'Every AI interaction is a mix of machine properties (what the model has/lacks) and human competencies (what you bring to steer it well); this course teaches both together',
      ] },
      { code: '1.2', title: 'Tokens, Context Windows & Why Claude Forgets', points: [
        'Text is broken into tokens (word-pieces) before Claude processes anything',
        'The context window is the max tokens Claude can hold at once — up to 1M tokens on flagship models today, smaller on lighter ones',
        'Once a conversation exceeds that limit, older content gets pushed out or summarised — this is why long chats feel like Claude "forgot" something',
        "A brand-new chat always starts blank unless you're inside a Project that carries context forward",
      ], assignment: 'Run a long conversation, then ask Claude to recall your very first message. See what happened.' },
      { code: '1.3', title: 'Hallucinations — Why They Happen, How to Catch Them', points: [
        'A hallucination is confident, fluent, but factually wrong output — fake citations, invented statistics, wrong specifics',
        'Happens most on niche topics, exact numbers, quotes, and anything past the knowledge cutoff',
        'Fix: use web search for time-sensitive or fact-specific questions instead of relying on memory',
        'Ask directly, "are you sure, or could this be a guess?" — Claude will often flag its own uncertainty when asked',
      ], assignment: 'Deliberately trigger a hallucination (ask about something obscure). Then verify it with search.' },
      { code: '1.4', title: 'Steerability & Property Collisions', points: [
        'Steerability is why the exact same question gets different answers depending on how you frame it — instructions genuinely change behaviour, not just tone',
        "Limitations don't show up in isolation; sometimes a short context window and a hallucination-prone gap collide on the same task, making the failure harder to diagnose",
        'Once you can name which property is misbehaving, you can fix it directly instead of just re-asking the same way and hoping',
      ], assignment: "Take one task where Claude's output disappointed you. Name which property (memory, knowledge, hallucination, steerability) was actually the cause." },
      { code: '1.5', title: 'Claude OS — Chat, Projects, Artifacts, Cowork, Code', points: [
        'Chat — quick questions, writing, analysis, back-and-forth',
        'Projects — persistent workspace that remembers context, instructions and files across every conversation inside it',
        'Artifacts — standalone reusable output (documents, code, diagrams, small interactive apps) that lives outside the chat scroll',
        'Cowork — a working session where Claude operates directly on your real files and folders, not just in a chat window',
        'Claude Code — an agentic coding partner across terminal, IDE, desktop and web',
        'Simple rule: quick question → Chat. Recurring context → Project. Something to keep/edit → Artifact. Multi-step real task on real files → Cowork. Building software → Claude Code',
      ], assignment: 'Run one task in plain Chat, then again inside a fresh Project. Compare the two outputs.' },
      { code: '1.6', title: 'The Claude Model Family — Choosing the Right One', points: [
        'Opus — deepest reasoning, for the hardest coding, research and enterprise work',
        'Sonnet — the balanced default for most everyday work',
        'Haiku — fastest and lightest, best for high-volume or simple tasks',
        'Mythos tier (Fable 5 / Mythos 5) — sits above Opus, reserved for the very highest capability needs',
        'Practical rule: default to Sonnet, escalate to Opus/Mythos for genuinely hard problems, drop to Haiku when speed or volume matters more than depth',
      ], assignment: 'Run one task on two different models. Score speed, depth and usefulness for that specific task.' },
      { code: '1.7', title: 'Memory — What Claude Remembers About You', points: [
        'Separate from Project context — Memory is Claude retaining preferences and facts across chats generally',
        'You can view, edit or clear what’s remembered at any time',
        'More continuity means more to actively manage for privacy — it’s a trade-off, not a free upgrade',
      ], assignment: 'Check what Claude currently remembers about you. Edit or remove one thing.' },
      { code: '1.8', title: 'Extended Thinking & Effort', points: [
        'Claude can "think longer" before answering on genuinely hard problems — visible or adjustable depending on the surface',
        'Higher effort = deeper reasoning and a slower response; not every question needs it',
        'Matching effort to task difficulty is itself a Delegation skill, covered fully in Module 2',
      ], assignment: 'Run the same hard problem at two different effort/thinking levels. Compare the quality gap.' },
    ],
  },
  {
    title: 'M02 · Working With Claude Well — Prompting & Workspace',
    lessons: [
      { code: '2.1', title: 'The 4D Framework', points: [
        'Delegation — deciding what to hand to Claude and what to keep for yourself; not everything should be delegated',
        'Description — giving context, constraints, audience and desired outcome, not just a bare question',
        'Discernment — reading Claude’s output critically before you trust or act on it',
        'Diligence — staying accountable for whatever you ship; Claude doesn’t carry that responsibility, you do',
        'Description and Discernment form a loop — describe, evaluate, refine, repeat — not a one-shot request',
      ], assignment: 'Take 5 real prompts you’ve used. Rewrite each with genuine Description. Compare before/after.' },
      { code: '2.2', title: 'Prompt Engineering — The Craft Underneath Description', points: [
        'Vague prompts produce vague output — this is the garbage-in rule, and it’s the single biggest lever you control',
        'Core levers to pull: context, length/format, examples, audience, and the specific result you want',
        'Role prompting ("act as a senior analyst") sharpens tone and framing but doesn’t add knowledge Claude doesn’t have',
        'Constraints are quality tools, not restrictions — word limits, format rules and tone directives all narrow the output toward what you actually need',
        'Chain prompting — break a complex task into sequential steps instead of one giant ask; each step’s output becomes the next step’s input',
        'Iterative refinement — treat Claude as a collaborator across multiple turns, not a vending machine you get one shot at',
        'For technical or highly structured asks, giving a clear example of the format you want beats describing the format in words',
        'What not to do: over-specifying trivial tasks (wastes your time), under-specifying important ones (wastes Claude’s accuracy)',
      ], assignment: 'Take one prompt that gives a weak result. Rewrite it 3 progressively stronger times. Compare all three outputs.' },
      { code: '2.3', title: 'Prompt Injection Awareness', points: [
        'A prompt injection is an instruction hidden inside a document, webpage or file that tries to hijack what Claude does next',
        'The core distinction: instructions embedded in content you asked Claude to read are not the same as instructions from you directly',
        'Red flag pattern: unexpected commands appearing inside "data" Claude is processing, rather than in your own message',
      ], assignment: 'Read one real example of a prompt injection attempt online. Identify the exact red flag that gives it away.' },
      { code: '2.4', title: 'Projects — Your Persistent Workspace', points: [
        'A Project keeps context, uploaded files and custom instructions in place across every conversation inside it',
        'As a project’s files approach the model’s context limit, Claude automatically switches to retrieval mode — searching and pulling only relevant passages instead of hitting a hard wall',
        'Custom instructions define who Claude should be inside this Project: tone, assumptions, default output format',
        'Practical pattern: one Project per role or domain (Research, Client Work, Study) rather than one giant catch-all',
      ], assignment: 'Build a Project with real instructions (150+ words), one uploaded document, and 3 completed real tasks.' },
      { code: '2.5', title: 'Artifacts — Turning Chat Into Real Deliverables', points: [
        'Standalone output opens in its own panel: documents, code, HTML pages, SVG diagrams, Mermaid flowcharts, small interactive tools',
        'Editable in place — highlight a section, describe the change, Claude edits just that part',
        'Can hold a small amount of persistent data — enough for a simple tracker or checklist',
        'Habit to build: don’t let good output die in the chat scroll; if you’ll reuse or share it, make it an Artifact',
      ], assignment: 'Build one real deliverable as an Artifact through at least two rounds of iteration, not one shot.' },
      { code: '2.6', title: 'Skills — Teaching Claude Your Way, Once', points: [
        'A Skill is a reusable instruction set Claude applies automatically whenever a task matches its description',
        'Costs almost no context until triggered — you can have many installed and only pay for the ones actually used',
        'Can carry reference material (a style guide, a checklist), accept inputs, and chain to other skills',
      ], assignment: 'Write a Skill for one output you produce often. Test it on a raw input with the Skill off, then on.' },
      { code: '2.7', title: 'Plugins — Packaged Expertise', points: [
        'A Plugin bundles Skills, Connectors and sometimes Subagents into one installable package',
        'How a team encodes a shared standard instead of everyone configuring their own version',
        'Works in both chat and Cowork; features needing an isolated session (hooks, subagents) only run in Cowork',
      ], assignment: 'Install one relevant Plugin. Run one real task through it and note what it set up automatically.' },
      { code: '2.8', title: 'Troubleshooting', points: [
        'A Skill that won’t trigger is usually a vague description problem, not a broken tool',
        'A Connector that fails — check authorisation and permissions before assuming something’s wrong with the connector itself',
        'Read Claude’s own clarifying or error messages carefully before assuming a task failed outright',
      ], assignment: 'Deliberately weaken your Skill’s description from 2.6. Diagnose exactly why it stopped firing.' },
      { code: '2.9', title: 'Sharing, Exporting & Publishing Your Work', points: [
        'Artifacts can be exported, shared via link, or published depending on the surface and your plan',
        'Know the difference between "keep it private", "share with my team" and "publish publicly" before you click anything',
        'Reviewing before publishing is Diligence in practice — the last human check before something leaves your hands',
      ], assignment: 'Take one Artifact from this course and go through the full export/share flow once, end to end.' },
    ],
  },
  {
    title: 'M03 · The Visual & Creative Layer',
    lessons: [
      { code: '3.1', title: 'Claude and Images — Reading, Not Just Writing', points: [
        'Claude accepts image input: screenshots, photos, scanned documents, charts, whiteboards',
        'Use case: a photo of handwritten or whiteboard notes → a clean, structured document',
        'Use case: a screenshot of an error → Claude reads and explains it directly, no retyping needed',
      ], assignment: 'Feed Claude a photo of handwritten or whiteboard notes. Get a structured summary back.' },
      { code: '3.2', title: 'Claude and Visual Output — Diagrams, Charts, Interactive Artifacts', points: [
        'Claude renders SVG graphics, Mermaid diagrams and interactive HTML natively inside Artifacts',
        'A spreadsheet can become a live, clickable dashboard instead of a static chart',
        'Ask for a diagram of a concept instead of a paragraph explaining it — often clearer, always faster to scan',
        'Important distinction: Claude generates diagrams and interactive visuals natively, but does not natively generate photorealistic images, audio or video — those require a connected specialist tool',
      ], assignment: "Take one concept you'd normally explain in text. Ask Claude to diagram it instead. Compare clarity." },
      { code: '3.3', title: 'Claude Design — Prototypes, Mockups & Polished Visuals', points: [
        'A dedicated Claude app for turning ideas into slides, prototypes, landing pages and one-pagers',
        'Best fit: pitch decks, visual mockups and polished one-page documents that need real design sense, not just structure',
        'Pairs naturally with Artifacts — draft the structure in chat, polish the visual layer in Claude Design',
      ], assignment: 'Take one Artifact from Module 2 and rebuild its visual layer using Claude Design.' },
      { code: '3.4', title: 'Working With Video & Audio Content', points: [
        'Claude reasons over transcripts, meeting notes and captions you provide — it processes the text of spoken content, not the raw audio/video file as media',
        'Feed in a voice memo transcript, get a structured brief and a first-draft email out, in one pass',
        'For actual image, video or audio generation, Claude connects out to specialist tools rather than producing that media itself',
      ], assignment: 'Take a real or recorded transcript and turn it into a structured brief in a single prompt.' },
      { code: '3.5', title: 'Bonus Round — Fun, Impressive Builds', points: [
        'A quiz, trivia game or choose-your-own-adventure as an interactive Artifact, built in one prompt',
        'A simple browser game (tic-tac-toe, memory match) as a throwaway Artifact',
        'A working calculator, converter or planner tool generated from a plain description',
      ], assignment: 'Pick one bonus build and ship it in a single sitting, purely to see the range of what’s possible.' },
    ],
  },
  {
    title: 'M04 · Reaching Further — Data, Tools & Research',
    lessons: [
      { code: '4.1', title: 'Connectors & MCP', points: [
        'Connectors let Claude read from and sometimes act on tools you already use: Drive, Gmail, Slack, DocuSign and more',
        'MCP (Model Context Protocol) is the open standard many connectors are built on — which is what lets the ecosystem grow over time',
        'You explicitly authorise each connection; nothing connects silently or by default',
      ], assignment: 'Connect one real tool. Run a task only that connection could answer — no manual copy-paste.' },
      { code: '4.2', title: 'Research — Trustworthy, Cited Deep Dives', points: [
        'Runs a multi-step, multi-source investigation and returns a cited answer you can trace back to its sources',
        'The right tool when a plain chat answer would need independent verification anyway',
        'Discernment still applies — read the actual citations, not just the summary paragraph',
      ], assignment: 'Run a real research question. Build a 300-word cited brief with 3 concrete recommendations.' },
      { code: '4.3', title: 'Claude Everywhere — Chrome, Excel, Word, PowerPoint, Outlook', points: [
        'Claude in Chrome — a browsing agent that can navigate pages and act on your behalf',
        'Claude for Excel / Word / PowerPoint / Outlook — works directly inside the app you already use',
        'Removes the copy-paste tax between thinking with Claude and delivering the actual work',
      ], assignment: 'Complete one real task inside one of these apps, start to finish, without leaving it.' },
      { code: '4.4', title: 'Voice Mode & Dictation', points: [
        'Talking to Claude instead of typing — useful for brainstorming or hands-busy moments',
        'Dictation often beats typing when you’re thinking out loud and don’t want to interrupt the flow to type',
        'Precise technical asks still benefit from typed detail — voice isn’t always the faster path',
      ], assignment: 'Brainstorm one idea entirely by voice. Compare the result to a typed version of the same idea.' },
      { code: '4.5', title: 'Multilingual Use', points: [
        'Claude works across many languages, not only English',
        'Translation quality varies by language pair and context — treat high-stakes translations with the same Discernment as any other fact',
        'Useful for drafting directly in a second language or checking tone and register before sending something out',
      ], assignment: 'Draft one message in a second language, then ask Claude to check tone and accuracy.' },
      { code: '4.6', title: 'Claude Cowork — Working Sessions on Real Files', points: [
        'A working session, not a conversation: Claude plans a multi-step task and executes it directly on your files',
        'Runs on the same agentic architecture as Claude Code, in an interface built for non-developers',
        'Can coordinate sub-agents on parallel pieces of one task, and use Chrome/Office extensions as tools mid-task',
        'Safety is built in: Cowork pauses on risky or irreversible actions, or asks first, rather than guessing',
      ], assignment: 'Hand Cowork one full multi-step task. Steer it at least once mid-task, then document the result.' },
    ],
  },
  {
    title: 'M05 · Delegation, Automation & Building',
    lessons: [
      { code: '5.1', title: 'Subagents — Delegating Without Losing Context', points: [
        'An isolated Claude instance that works on one piece of a task independently, with its own context window',
        'Reports back only a summary, keeping your main conversation clean and focused',
        'Best for noisy, exploratory or parallelisable work where you only care about the outcome, not the process',
      ], assignment: 'Split one long task into a main task plus one delegated sub-task. Define exactly what should come back.' },
      { code: '5.2', title: 'Scheduled & Recurring Tasks', points: [
        'Turn a one-off Cowork task into a recurring one — a daily brief, a weekly review',
        'The prompt must be self-contained, since there’s no back-and-forth mid-run to clarify anything',
        'Rule of thumb: exhaust native Claude automation before reaching for external tools like Zapier or n8n',
      ], assignment: 'Build a recurring brief. Run it for 3 cycles, refining the prompt after the first.' },
      { code: '5.3', title: 'Claude Code — Building Real Things, No Deep Coding Required', points: [
        'The loop: explore what exists → plan the change → let Claude write the code → review and commit',
        'You don’t need to know how to code — describe the outcome clearly, review what comes back, ask for specific fixes',
        'Good fit: small internal tools, trackers, calculators, dashboards, landing pages',
        'Not a good fit without expert review: production-scale or security-sensitive systems',
      ], assignment: 'Build one small real tool. Iterate at least 3 times. Share it with someone outside this course.' },
      { code: '5.4', title: 'Comparing Claude to Other AI Tools', points: [
        'Not every task needs Claude — knowing when a specialist tool is the better fit is part of fluency, not a failure',
        'Claude’s real strength is reasoning, writing, judgment and agentic multi-step work',
        'Other tools lead on pure image/video generation and narrow single-purpose apps',
      ], assignment: 'Name one task you currently force into Claude that a specialist tool would genuinely do better.' },
      { code: '5.5', title: 'Responsible & Ethical Use', points: [
        'Attribution and disclosure — being upfront about where AI assisted real work',
        'Academic integrity — using Claude to learn faster, not to bypass the learning itself',
        'Professional integrity — reviewing before you put your name on anything AI-assisted',
      ], assignment: 'Write your own one-line personal rule for when you’ll disclose AI assistance, and when you won’t need to.' },
      { code: '5.6', title: 'Safety, Judgment & Career Positioning', points: [
        'Diligence stays with you — review before sending, publishing, deleting or spending anything',
        'No safety layer, including Cowork’s built-in checks, replaces your own judgment',
        'Proof of specific outcomes beats a list of tools used — "I built X, saving Y hours" over "I use AI"',
      ], assignment: 'Write 3–5 sentences describing how you actually use Claude, with one concrete outcome.' },
    ],
  },
  {
    title: 'M06 · Beyond the Individual — Devices, Teams & Enterprise',
    lessons: [
      { code: '6.1', title: 'Claude on Every Device', points: [
        'Claude mobile app (iOS/Android) — Chat and Cowork on the go',
        'Claude Desktop — a unified app combining Chat, Cowork and Code',
        'Claude Tag — teammates tag @Claude into Slack to delegate work without switching apps',
      ], assignment: 'Complete one real task entirely from your phone.' },
      { code: '6.2', title: 'Building on Claude — API Basics', points: [
        'Covers system prompts and citation mechanics — why exact wording in instructions matters at the API level',
      ], assignment: 'Optional: read one API quickstart. Note one thing that surprised you about how it works.' },
      { code: '6.3', title: 'Team & Enterprise Layer', points: [
        'Shared Projects, admin controls and plugin governance at the organisation level',
        'Group-based access means not everyone in an org sees the same plugin catalogue',
      ], assignment: 'If applicable, identify what your organisation’s admin controls or shares centrally.' },
      { code: '6.4', title: 'Data, Privacy & Permissions', points: [
        'What Claude can see, what it can’t, and how retention settings actually work',
        'Enterprise data controls differ meaningfully from personal account defaults',
      ], assignment: 'Review your own privacy and retention settings once, end to end.' },
      { code: '6.5', title: 'Role-Based Claude', points: [
        'Pre-built flavours for Engineering, Marketing, Sales, HR, Product and Financial Services',
        'A faster starting point than configuring a workspace completely from scratch',
      ], assignment: 'Try the role-based flavour closest to your work. Note what it pre-configured for you automatically.' },
      { code: '6.6', title: 'Plans & Choosing the Right Tier', points: [
        'Free, Pro, Max, Team and Enterprise plans differ in usage limits, model access and collaboration features',
        'Match the tier to actual usage patterns — heavy daily use and light occasional use have very different needs',
        'Revisit this choice periodically as your usage (and Claude’s feature set) changes',
      ], assignment: 'Compare your current plan against your actual weekly usage. Note if it’s under- or over-provisioned.' },
      { code: '6.7', title: 'Staying AI-Literate', points: [
        'Spotting AI-generated misinformation is now as practical a skill as producing content with AI',
        'Track new Claude releases without relearning everything from scratch each time — skim, don’t re-study',
        'Media literacy has moved from an academic topic to a daily practical one',
      ], assignment: 'Find one piece of content online. Assess whether it’s likely AI-generated, and explain why.' },
    ],
  },
  {
    title: 'M07 · Real-World Use Case Library',
    lessons: [
      { code: '7.1', title: 'Personal Productivity', points: ['Daily/weekly planning brief', 'Inbox triage', 'Meeting prep and follow-up', 'Decision-making support', 'Faster learning'] },
      { code: '7.2', title: 'Work — Knowledge & Office Tasks', points: ['Report and memo drafting', 'Decks from an outline', 'Spreadsheet cleanup', 'Research briefs', 'File organisation'] },
      { code: '7.3', title: 'Students & Academics', points: ['Study guides', 'Practice questions', 'Literature review scaffolding', 'Multi-angle explanations'] },
      { code: '7.4', title: 'Builders & Creators', points: ['Prototypes via Claude Code', 'Content repurposing', 'Dataset-to-insight projects'] },
      { code: '7.5', title: 'Small Business, Freelance & Ops', points: ['Proposals and contracts', 'Customer emails in your voice', 'Expense cleanup', 'One Project per business function'] },
      { code: '7.6', title: 'Automation & Systems Thinking', points: ['The 3-task method', 'Chained tool workflows', 'Knowing when to leave Claude for external automation'] },
      { code: '7.7', title: 'Career & Portfolio', points: ['Visible portfolio of real outputs', 'Interview-ready workflow explanations', 'Outcome-based positioning'] },
      { code: '7.8', title: 'Claude as Thinking Partner', points: ['Debate mode', 'Red-team your own plan', 'Rubber-duck a stuck problem', 'Perspective-shifting', 'Pressure-test writing'] },
    ],
  },
  {
    title: 'M08 · Capstone Menu',
    lessons: [
      { code: '8.1', title: 'Personal AI Operating System', points: ['A Project + Skill + Connector completing 3 real weekly tasks'] },
      { code: '8.2', title: 'Research Intelligence Brief', points: ['A cited deep-dive on a real decision, using Research + Discernment'] },
      { code: '8.3', title: 'Automation Suite', points: ['One Cowork task + one Skill + one recurring scheduled brief, running for real'] },
      { code: '8.4', title: 'Vibe-Built Tool', points: ['A small working app or dashboard built with Claude Code, shared with one outside person'] },
      { code: '8.5', title: 'Visual Showcase', points: ['A dashboard Artifact + a Claude Design piece + one "cool trick", combined into one demo'] },
    ],
  },
];

// ── Sample projects & assignments ─────────────────────────────────────────
// Drawn from the course's own capstone menu, so the Projects tab shows real
// work rather than lorem ipsum. Each carries the same video + PDF as a lesson;
// what students hand BACK is written work only — documents, decks, artifacts.
const PROJECTS = [
  {
    type: 'assignment',
    title: 'AI Audit — where does AI already touch your life?',
    requires: ['doc'],
    description: [
      'A warm-up for Module 1. Work through it in one sitting.',
      '',
      '1. List 10 tools or products you use daily, and mark which ones use AI.',
      '2. Pick one, read how it works, and write three sentences in plain language.',
      '3. Ask Claude to explain it to someone who has never heard of an LLM, then critique the answer.',
      '4. Find one public LLM hallucination, quote it, and note why it happened.',
      '',
      '**Submit:** a short write-up (under 300 words) in your Drive folder.',
    ].join('\n'),
  },
  {
    type: 'project',
    title: 'Personal AI Operating System',
    requires: ['doc', 'slides'],
    description: [
      'Build the workspace you will actually keep using after this course.',
      '',
      '- One **Project** with real custom instructions (150+ words) and at least one uploaded file.',
      '- One **Skill** covering an output you produce often.',
      '- One **Connector** wired to a tool you genuinely use.',
      '- Three real weekly tasks run end to end through it.',
      '',
      '**Submit:** a one-page write-up of the setup and what it saves you, plus a short slide deck walking through it.',
    ].join('\n'),
  },
  {
    type: 'project',
    title: 'Vibe-Built Tool — ship something small and real',
    requires: ['doc', 'html'],
    description: [
      'Use Claude Code to build one small working thing: a tracker, calculator, dashboard or landing page.',
      '',
      '- Iterate at least three times — the first output is never the one you ship.',
      '- Review what comes back; you are accountable for what you publish.',
      '- Share it with one person outside this course and capture their reaction.',
      '',
      '**Submit:** the exported HTML file (or a link to the artifact), plus a short note on what you changed between iterations.',
    ].join('\n'),
  },
];

// ── Gate quizzes: one per module, 3 questions each ────────────────────────
const QUIZZES = [
  ['What Claude is actually doing when it answers', [
    ['Claude answers by…', ['Predicting the next likely piece of text from learned patterns', 'Looking facts up in a database', 'Searching the web on every message'], 0],
    ['Fluency and accuracy are…', ['The same thing', 'Separate properties — one does not guarantee the other', 'Both guaranteed by a bigger context window'], 1],
    ['A brand-new chat starts blank unless…', ["You're inside a Project that carries context forward", 'You paid for Max', 'You ask Claude to remember'], 0],
  ]],
  ['Prompting and the 4D framework', [
    ['The four Ds are…', ['Delegation, Description, Discernment, Diligence', 'Draft, Debug, Deploy, Deliver', 'Define, Design, Develop, Deliver'], 0],
    ['Role prompting ("act as a senior analyst")…', ['Adds knowledge Claude lacks', 'Sharpens tone and framing but adds no new knowledge', 'Increases the context window'], 1],
    ['A Skill that will not trigger is usually…', ['A broken tool', 'A vague description problem', 'A billing issue'], 1],
  ]],
  ['The visual and creative layer', [
    ['Claude natively generates…', ['Photorealistic images and video', 'SVG, Mermaid diagrams and interactive HTML', 'Nothing visual at all'], 1],
    ['For audio and video generation Claude…', ['Produces the media itself', 'Connects out to specialist tools', 'Refuses entirely'], 1],
    ['Claude processes spoken content by…', ['Listening to the raw audio file', 'Reasoning over the transcript text you provide', 'Rendering a waveform'], 1],
  ]],
  ['Connectors, research and reaching further', [
    ['MCP is…', ['A Claude subscription tier', 'The open standard many connectors are built on', 'A prompt format'], 1],
    ['Connections are authorised…', ['Automatically by default', 'Explicitly by you, one at a time', 'By your employer only'], 1],
    ['Cowork differs from Chat because it…', ['Executes multi-step tasks directly on your real files', 'Only writes longer answers', 'Runs a different model family'], 0],
  ]],
  ['Delegation, automation and building', [
    ['A subagent reports back…', ['Its full transcript', 'Only a summary, keeping your main context clean', 'Nothing at all'], 1],
    ['A scheduled task’s prompt must be…', ['Short', 'Self-contained, since there is no mid-run clarification', 'Written in the API'], 1],
    ['Claude Code is a poor fit, without expert review, for…', ['Small internal tools', 'Production-scale or security-sensitive systems', 'Landing pages'], 1],
  ]],
  ['Devices, teams and enterprise', [
    ['Claude Tag lets teammates…', ['Tag @Claude into Slack to delegate work', 'Rename their chats', 'Share a login'], 0],
    ['Enterprise data controls…', ['Are identical to personal defaults', 'Differ meaningfully from personal account defaults', 'Do not exist'], 1],
    ['Choosing a plan should be driven by…', ['The newest tier available', 'Your actual weekly usage patterns', 'What your friend uses'], 1],
  ]],
  ['Real-world use cases', [
    ['A good "thinking partner" use of Claude is…', ['Red-teaming your own plan', 'Asking it to feel emotions', 'Having it pick your lunch'], 0],
    ['For a small business, a sensible Project structure is…', ['One giant catch-all Project', 'One Project per business function', 'A new Project per message'], 1],
    ['Outcome-based positioning sounds like…', ['"I use AI"', '"I built X, saving Y hours"', '"I know many tools"'], 1],
  ]],
  ['Capstone readiness', [
    ['A capstone should be…', ['A shipped, real piece of proof-of-work', 'A written summary of the course', 'A list of tools'], 0],
    ['The Automation Suite capstone requires…', ['One Cowork task + one Skill + one recurring brief', 'Three Artifacts', 'An API key'], 0],
    ['Diligence at capstone time means…', ['Shipping fast without review', 'Reviewing before you put your name on it', 'Letting Claude decide'], 1],
  ]],
];

function buildModules() {
  return MODULES.map((m, mi) => ({
    title: m.title,
    order: mi,
    // One chapter per module so the sidebar shows a flat lesson list — the
    // client hides a lone chapter titled "Lessons".
    chapters: [{
      title: 'Lessons',
      order: 0,
      topics: m.lessons.map((l, li) => ({
        title: `${l.code} · ${l.title}`,
        contentType: 'video',
        contentUrl: VIDEO,
        readingUrl: PDF,
        order: li,
        body: [
          ...l.points.map((p) => `- ${p}`),
          ...(l.assignment ? ['', `**Assignment.** ${l.assignment}`] : []),
        ].join('\n'),
      })),
    }],
  }));
}

async function run() {
  await connectDb();

  // ── Retire the old programmes ──
  const old = await Program.find({ title: { $in: ['Kickstarter', 'Fellowship'] } }).select('_id title');
  if (old.length) {
    const ids = old.map((p) => p._id);
    const oldQuizzes = await Quiz.find({ programId: { $in: ids } }).select('_id');
    await QuizAttempt.deleteMany({ quizId: { $in: oldQuizzes.map((q) => q._id) } });
    await Quiz.deleteMany({ programId: { $in: ids } });
    await Program.deleteMany({ _id: { $in: ids } });
    console.log(`• removed ${old.length} old programme(s): ${old.map((p) => p.title).join(', ')}`);
  }

  // ── The Claude programme ──
  const modules = buildModules();
  let program = await Program.findOne({ title: 'Claude' });
  if (!program) program = await Program.create({ title: 'Claude', type: 'cohort', published: true });
  program.modules = modules;
  program.description = 'Everything you need to work well with Claude — foundations, prompting, the visual layer, connectors, delegation and the enterprise picture.';
  program.published = true;
  await program.save();

  const lessons = modules.reduce((n, m) => n + m.chapters[0].topics.length, 0);
  console.log(`✓ Claude: ${modules.length} modules · ${lessons} lessons (each with a video + PDF)`);

  // ── Collapse to ONE course ──
  // There are no cohorts in this product. A single Batch record still backs the
  // course server-side (assignments, quizzes and announcements hang off a
  // batchId), but it is never a choice anyone makes. Fold any extras into the
  // oldest one, move their students and work across, then delete them.
  const all = await Batch.find({}).sort({ createdAt: 1 });
  let course = all[0];
  if (!course) {
    course = await Batch.create({ programId: program._id, name: program.title, status: 'ongoing' });
    console.log('• created the course record');
  }
  const extras = all.slice(1);
  for (const b of extras) {
    await Batch.updateOne({ _id: course._id }, { $addToSet: { studentIds: { $each: b.studentIds || [] } } });
    await User.updateMany({ batchIds: b._id }, { $addToSet: { batchIds: course._id } });
    await User.updateMany({ batchIds: b._id }, { $pull: { batchIds: b._id } });
    // Anything scoped to the retired batch moves across rather than vanishing.
    await Assignment.updateMany({ batchId: b._id }, { $set: { batchId: course._id } });
    await Quiz.updateMany({ batchId: b._id }, { $set: { batchId: course._id } });
    await Batch.deleteOne({ _id: b._id });
  }
  if (extras.length) console.log(`• folded ${extras.length} extra batch(es) into the single course`);

  await Batch.updateOne({ _id: course._id }, { $set: { programId: program._id, name: program.title, status: 'ongoing' } });
  const batches = await Batch.find({});
  const moved = 1;
  // Enrolment is stored on both sides (batch.studentIds and user.batchIds) and
  // they can drift — a student left in a batch's roster but not their own list
  // then sees that cohort's work as duplicates. Make the user's list the
  // authority and prune the rosters to match.
  let pruned = 0;
  for (const b of batches) {
    const keep = [];
    for (const sid of b.studentIds || []) {
      const u = await User.findById(sid).select('batchIds');
      if (u && (u.batchIds || []).map(String).includes(String(b._id))) keep.push(sid);
      else pruned += 1;
    }
    if (keep.length !== (b.studentIds || []).length) {
      await Batch.updateOne({ _id: b._id }, { $set: { studentIds: keep } });
      b.studentIds = keep;
    }
  }
  if (pruned) console.log(`• pruned ${pruned} stale roster entr(ies) that the student's own record didn't confirm`);

  const enrolled = batches.reduce((n, b) => n + (b.studentIds || []).length, 0);
  console.log(`✓ one course "${program.title}" — ${enrolled} student(s) enrolled`);

  // ── One gate quiz per module ──
  // Wipe and rebuild so re-running doesn't stack duplicates. Attempts go too,
  // which is what you want when re-seeding to re-test the gating flow.
  const existing = await Quiz.find({ programId: program._id }).select('_id');
  await QuizAttempt.deleteMany({ quizId: { $in: existing.map((q) => q._id) } });
  await Quiz.deleteMany({ programId: program._id });

  for (let i = 0; i < program.modules.length; i += 1) {
    const mod = program.modules[i];
    const [subject, qs] = QUIZZES[i];
    await Quiz.create({
      programId: program._id,
      moduleId: String(mod._id),
      title: `Module ${i + 1} quiz — ${subject}`,
      type: 'quiz',
      questions: qs.map(([text, options, correctIndex]) => ({ text, options, correctIndex })),
    });
  }
  console.log(`✓ ${program.modules.length} gate quizzes — attempt one to unlock the next module`);

  // ── Sample projects, one per batch, each with video + PDF + brief ──
  // Rebuilt every run (and their submissions with them) so the Projects tab
  // always has real content to look at.
  const seeded = await Assignment.find({ title: { $in: PROJECTS.map((p) => p.title) } }).select('_id');
  await Submission.deleteMany({ assignmentId: { $in: seeded.map((a) => a._id) } });
  await Assignment.deleteMany({ _id: { $in: seeded.map((a) => a._id) } });

  const DAY = 24 * 60 * 60 * 1000;
  let made = 0;
  for (const b of batches) {
    for (let i = 0; i < PROJECTS.length; i += 1) {
      const p = PROJECTS[i];
      await Assignment.create({
        batchId: b._id,
        type: p.type,
        title: p.title,
        description: p.description,
        videoUrl: VIDEO,
        pdfUrl: PDF,
        // Staggered deadlines so the Projects list has a real running order.
        startDate: new Date(Date.now() - (2 - i) * 7 * DAY),
        dueDate: new Date(Date.now() + (i + 1) * 7 * DAY),
        requiredDriveTypes: p.requires,
      });
      made += 1;
    }
  }
  console.log(`✓ ${made} sample projects/assignments — each with a video, a PDF and a brief`);

  console.log('\n✅ Claude programme seeded.');
  process.exit(0);
}

run().catch((err) => { console.error('Claude seed failed:', err); process.exit(1); });

// Seed the "Claude" programme — the only programme in the LMS.
//
// Writes the 8-module, 8-week course from claudeCurriculum.js, removes any
// older programme left in the database, and creates one gate quiz per module.
// A student must ATTEMPT a module's quiz before the next module unlocks (see
// client Learning.jsx). It also sets the coursework: one assignment per module
// that has hands-on tasks, and the five Module 8 capstones as projects.
//
// Every lesson carries a video (played inline) and a PDF (opened in the
// in-page viewer) — those two surfaces only.
//
// This re-authors a LIVE curriculum, so it is a dry run by default: it prints
// the changes it would make and writes nothing. Commit them with --write.
//   npm run seed:claude            # dry run — report only
//   npm run seed:claude -- --write # commit
//
// Re-authoring merges into the existing tree rather than replacing it, so
// lesson ids (and the completion ticks, module blocks and gate quizzes keyed
// on them) survive, as does any media an admin attached. Running it twice in a
// row must report zero changes.
import 'dotenv/config';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';
import { Progress } from '../models/Progress.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { mergeModules, idsOf } from '../utils/curriculumMerge.js';
import { MODULES } from './claudeCurriculum.js';

// Stand-in video so the flow is clickable end to end. Swap per lesson later.
const VIDEO = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4';
// The course's own curriculum, served by the client from client/public/pdfs/
// (rebuild it with scripts/buildCurriculumPdf.js). Relative, so it resolves
// against whichever host serves the app — same-origin, which pdf.js needs.
const PDF = '/pdfs/skeo_Claude_Curriculum.pdf';
// The retired programme's curriculum, which every lesson and project used to
// open. Stored media normally wins over the seed (see curriculumMerge.js), so
// this one is swapped out explicitly wherever it is still attached.
const RETIRED_PDF = 'https://menler.in/pdfs/Menler_AI_Kickstarter_Curriculum.pdf';

// ── Assignments & projects ────────────────────────────────────────────────
// The course runs eight weeks, one module a week. Each module's hands-on tasks
// become that week's assignment; Module 8's capstone menu becomes the
// projects, of which a student ships one. What students hand BACK is written
// work only — documents, decks, artifacts.
const WEEK = 7 * 24 * 60 * 60 * 1000;

// One assignment per module that sets tasks. Module 7 is a use-case library
// and Module 8 is the capstone, so neither sets one here.
const ASSIGNMENTS = MODULES
  .map((m, mi) => ({ m, week: mi + 1, tasks: m.lessons.filter((l) => l.assignment) }))
  .filter(({ tasks }) => tasks.length)
  .map(({ m, week, tasks }) => {
    const [code, name] = m.title.split(' · ');
    return {
      type: 'assignment',
      title: `${code} assignment · ${name.split(' — ')[0]}`,
      requires: ['doc'],
      opensWeek: week - 1,
      dueWeek: week,
      description: [
        `The hands-on tasks set in the lessons of **${m.title}**. Do each one in Claude, then write up what happened.`,
        '',
        ...tasks.map((l, i) => `${i + 1}. **${l.code} ${l.title}** — ${l.assignment}`),
        '',
        '**Submit:** one document with a short write-up per task — what you did, what Claude gave back, and what you learned. Screenshots welcome. Put it in your Drive folder and paste the link.',
      ].join('\n'),
    };
  });

// The Module 8 menu. Every capstone is listed so a student can read them all
// and choose; the shared intro says to ship exactly one.
const CAPSTONE_INTRO = '**Capstone — pick ONE of the five to ship as your final proof of work.** Submit only the one you chose.';
const CAPSTONES = [
  {
    code: '8.1',
    requires: ['doc', 'slides'],
    brief: [
      'Build the workspace you will actually keep using after this course.',
      '',
      '- One **Project** with real custom instructions (150+ words) and at least one uploaded file (2.4).',
      '- One **Skill** covering an output you produce often (2.6).',
      '- One **Connector** wired to a tool you genuinely use (4.1).',
      '- Three real weekly tasks run end to end through it.',
      '',
      '**Submit:** a one-page write-up of the setup and what it saves you, plus a short slide deck walking through it.',
    ],
  },
  {
    code: '8.2',
    requires: ['doc'],
    brief: [
      'Take a real decision you, your team or your business is facing and research it properly.',
      '',
      '- Run it through **Research** (4.2) for a multi-source, cited investigation.',
      '- Apply **Discernment**: open the actual citations, check the claims that matter, and note anything you rejected and why.',
      '- End with a clear recommendation and the 2–3 options you weighed against it.',
      '',
      '**Submit:** the cited brief, plus a short note on which sources you verified and what you changed after checking them.',
    ],
  },
  {
    code: '8.3',
    requires: ['doc'],
    brief: [
      'Automate a slice of your real week and leave it running.',
      '',
      '- One **Cowork** task run end to end on real files (4.6).',
      '- One **Skill** that the automation leans on (2.6).',
      '- One **recurring scheduled brief** with a self-contained prompt, run for at least three cycles (5.2).',
      '',
      '**Submit:** a write-up of the three pieces, how they connect, the output of each brief cycle, and what you refined after the first run.',
    ],
  },
  {
    code: '8.4',
    requires: ['doc', 'html'],
    brief: [
      'Use **Claude Code** (5.3) to build one small working thing: a tracker, calculator, dashboard or landing page.',
      '',
      '- Iterate at least three times — the first output is never the one you ship.',
      '- Review what comes back; you are accountable for what you publish.',
      '- Share it with one person outside this course and capture their reaction.',
      '',
      '**Submit:** the exported HTML file (or a link to the artifact), plus a short note on what you changed between iterations and what your outside tester said.',
    ],
  },
  {
    code: '8.5',
    requires: ['doc', 'html'],
    brief: [
      'Show the range of what Claude can make, in one demo.',
      '',
      '- A **dashboard Artifact** built from real data (3.2).',
      '- A **Claude Design** piece — a deck, mockup or one-pager (3.3).',
      '- One **"cool trick"** from the bonus round or the thinking-partner list (3.5, 7.8).',
      '- Combine them into one walkthrough someone could follow without you.',
      '',
      '**Submit:** the dashboard as HTML (or an artifact link), plus a document linking the Claude Design piece and explaining the trick.',
    ],
  },
];
const capstoneLessons = MODULES[MODULES.length - 1].lessons;
const PROJECTS = CAPSTONES.map((c) => {
  const lesson = capstoneLessons.find((l) => l.code === c.code);
  return {
    type: 'project',
    title: `Capstone · ${lesson.title}`,
    requires: c.requires,
    // Open from Week 7 so there is time to plan; due at the end of Week 8.
    opensWeek: 6,
    dueWeek: 8,
    description: [CAPSTONE_INTRO, '', `*${lesson.points[0]}.*`, '', ...c.brief].join('\n'),
  };
});

const COURSEWORK = [...ASSIGNMENTS, ...PROJECTS];

// Earlier seeds wrote these titles. A rename keeps the record — and any
// submissions on it — under its new title; a retired one is removed, but only
// while nobody has submitted to it.
const RENAMED = {
  'Personal AI Operating System': 'Capstone · Personal AI Operating System',
  'Vibe-Built Tool — ship something small and real': 'Capstone · Vibe-Built Tool',
};
const RETIRED = ['AI Audit — where does AI already touch your life?'];

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
    // The module's page: markdown shown when the week is opened. Not a lesson —
    // nothing to complete, and totalTopics() never counts it. Empty until the
    // framing copy is authored.
    description: m.page || '',
    // One chapter per module so the sidebar shows a flat lesson list — the
    // client hides a lone chapter titled "Lessons", and a chapter with no page
    // stays a plain label rather than becoming a dropdown.
    chapters: [{
      title: 'Lessons',
      order: 0,
      description: '',
      pageLabel: '',
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

const sameQuestions = (a, b) =>
  a.length === b.length && a.every((q, i) =>
    q.text === b[i].text
    && q.correctIndex === b[i].correctIndex
    && (q.options || []).join('|') === (b[i].options || []).join('|'));

// Never write to a database without being told to. The default is a dry run
// that reports exactly what would change; --write is the only way to commit.
const WRITE = process.argv.includes('--write');

async function run() {
  await connectDb();
  const log = [];
  let changes = 0;
  const note = (line) => { log.push(line); changes += 1; };

  // ── Retire the old programmes ──
  // Kickstarter, Fellowship and the Generalist track predate the Claude course.
  const old = await Program.find({ title: /kickstart|fellowship|generalist/i }).select('_id title');
  if (old.length) {
    note(`- remove ${old.length} old programme(s): ${old.map((p) => p.title).join(', ')}`);
    if (WRITE) {
      const ids = old.map((p) => p._id);
      const oldQuizzes = await Quiz.find({ programId: { $in: ids } }).select('_id');
      await QuizAttempt.deleteMany({ quizId: { $in: oldQuizzes.map((q) => q._id) } });
      await Quiz.deleteMany({ programId: { $in: ids } });
      await Program.deleteMany({ _id: { $in: ids } });
    }
  }

  // ── The Claude programme ──
  const desired = buildModules();
  let program = await Program.findOne({ title: 'Claude' });
  if (!program) {
    note('- create the "Claude" programme');
    if (WRITE) program = await Program.create({ title: 'Claude', type: 'cohort', published: true });
  }

  // The merge never overwrites stored media, so the retired curriculum PDF is
  // replaced here, before it runs. Anything else an admin attached stays.
  let swapped = 0;
  for (const m of program?.modules || []) {
    for (const c of m.chapters || []) {
      for (const t of c.topics || []) {
        if (t.readingUrl === RETIRED_PDF) { t.readingUrl = PDF; swapped += 1; }
      }
    }
  }
  if (swapped) note(`- point ${swapped} lesson(s) at the Claude curriculum PDF instead of the retired one`);

  const before = idsOf(program?.modules || []);
  const { modules: merged, log: treeLog } = mergeModules(program?.modules || [], desired);
  const after = idsOf(merged);
  if (treeLog.length) { log.push('- curriculum:'); log.push(...treeLog); changes += treeLog.length; }

  // Anything the re-author dropped: ids that existed before and don't now.
  const orphanTopics = [...before.topics].filter((id) => !after.topics.has(id));
  const orphanModules = [...before.modules].filter((id) => !after.modules.has(id));

  const description = 'Everything you need to work well with Claude — foundations, prompting, the visual layer, connectors, delegation and the enterprise picture.';
  if (program && (program.description !== description || !program.published)) {
    note('- update the programme description / published flag');
  }

  if (WRITE && program) {
    program.modules = merged;
    program.description = description;
    program.published = true;
    await program.save();
  }
  const liveModules = WRITE && program ? program.modules : merged;
  const lessonCount = merged.reduce((n, m) => n + m.chapters.reduce((c, ch) => c + ch.topics.length, 0), 0);
  const keptTopics = [...after.topics].filter((id) => before.topics.has(id)).length;
  const keptModules = [...after.modules].filter((id) => before.modules.has(id)).length;
  console.log(`\n  Claude: ${merged.length} modules, ${lessonCount} lessons`);
  console.log(`  ids preserved: ${keptTopics}/${before.topics.size} lessons, ${keptModules}/${before.modules.size} modules`);

  // ── Prune what the re-author left dangling ──
  // A completion tick naming a lesson that no longer exists is invisible in the
  // UI but still counts toward Progress.completedTopics.length, so it has to go.
  if (orphanTopics.length) {
    const stale = await Progress.countDocuments({ completedTopics: { $in: orphanTopics } });
    if (stale) {
      note(`- prune ticks on ${orphanTopics.length} dropped lesson(s) across ${stale} student record(s)`);
      if (WRITE) await Progress.updateMany({}, { $pull: { completedTopics: { $in: orphanTopics } } });
    }
  }
  if (orphanModules.length) {
    const blocked = await User.countDocuments({ 'blocked.moduleIds': { $in: orphanModules } });
    if (blocked) {
      note(`- clear module blocks on ${orphanModules.length} dropped module(s) for ${blocked} user(s)`);
      if (WRITE) await User.updateMany({}, { $pull: { 'blocked.moduleIds': { $in: orphanModules } } });
    }
  }

  // ── Collapse to ONE course ──
  // There are no cohorts in this product. A single Batch record still backs the
  // course server-side (assignments, quizzes and announcements hang off a
  // batchId), but it is never a choice anyone makes.
  const all = await Batch.find({}).sort({ createdAt: 1 });
  let course = all[0];
  if (!course) {
    note('- create the course record');
    if (WRITE) course = await Batch.create({ programId: program._id, name: program.title, status: 'ongoing' });
  }
  const extras = all.slice(1);
  if (extras.length) {
    note(`- fold ${extras.length} extra batch(es) into the single course`);
    if (WRITE) {
      for (const b of extras) {
        await Batch.updateOne({ _id: course._id }, { $addToSet: { studentIds: { $each: b.studentIds || [] } } });
        await User.updateMany({ batchIds: b._id }, { $addToSet: { batchIds: course._id } });
        await User.updateMany({ batchIds: b._id }, { $pull: { batchIds: b._id } });
        // Anything scoped to the retired batch moves across rather than vanishing.
        await Assignment.updateMany({ batchId: b._id }, { $set: { batchId: course._id } });
        await Quiz.updateMany({ batchId: b._id }, { $set: { batchId: course._id } });
        await Batch.deleteOne({ _id: b._id });
      }
    }
  }
  if (course && program
    && (String(course.programId) !== String(program._id) || course.name !== program.title || course.status !== 'ongoing')) {
    note('- point the course record at the Claude programme');
    if (WRITE) await Batch.updateOne({ _id: course._id }, { $set: { programId: program._id, name: program.title, status: 'ongoing' } });
  }

  // Enrolment is stored on both sides (batch.studentIds and user.batchIds) and
  // they can drift — a student left in a batch's roster but not their own list
  // then sees that cohort's work as duplicates. Make the user's list the
  // authority and prune the rosters to match.
  const batches = await Batch.find({});
  let pruned = 0;
  for (const b of batches) {
    const keep = [];
    for (const sid of b.studentIds || []) {
      const u = await User.findById(sid).select('batchIds');
      if (u && (u.batchIds || []).map(String).includes(String(b._id))) keep.push(sid);
      else pruned += 1;
    }
    if (keep.length !== (b.studentIds || []).length) {
      if (WRITE) await Batch.updateOne({ _id: b._id }, { $set: { studentIds: keep } });
      b.studentIds = keep;
    }
  }
  if (pruned) note(`- prune ${pruned} stale roster entr(ies) the student's own record did not confirm`);
  const enrolled = batches.reduce((n, b) => n + (b.studentIds || []).length, 0);
  console.log(`  one course "${program?.title || 'Claude'}" - ${enrolled} student(s) enrolled`);

  // ── One gate quiz per module ──
  // Upserted, not wiped and rebuilt: deleting a quiz takes its attempts with
  // it, and re-running the authoring step must not cost students their gates.
  const liveModuleIds = new Set();
  for (let i = 0; i < liveModules.length; i += 1) {
    const mod = liveModules[i];
    const moduleId = String(mod._id);
    liveModuleIds.add(moduleId);
    const [subject, qs] = QUIZZES[i];
    const title = `Module ${i + 1} quiz — ${subject}`;
    const questions = qs.map(([text, options, correctIndex]) => ({ text, options, correctIndex }));
    const existing = program ? await Quiz.findOne({ programId: program._id, moduleId }) : null;
    if (!existing) {
      note(`- create gate quiz: ${title}`);
      if (WRITE) await Quiz.create({ programId: program._id, moduleId, title, type: 'quiz', questions });
    } else if (existing.title !== title || !sameQuestions(existing.questions || [], questions)) {
      note(`- update gate quiz: ${title}`);
      if (WRITE) { existing.title = title; existing.questions = questions; await existing.save(); }
    }
  }
  // A gate pointing at a module that no longer exists can never be reached.
  if (program) {
    const dangling = (await Quiz.find({ programId: program._id }).select('_id moduleId title'))
      .filter((q) => q.moduleId && !liveModuleIds.has(String(q.moduleId)));
    if (dangling.length) {
      note(`- remove ${dangling.length} gate quiz(zes) whose module is gone`);
      if (WRITE) {
        await QuizAttempt.deleteMany({ quizId: { $in: dangling.map((q) => q._id) } });
        await Quiz.deleteMany({ _id: { $in: dangling.map((q) => q._id) } });
      }
    }
  }

  // ── Assignments & projects, per batch ──
  for (const b of batches) {
    // The 8-week schedule counts from the course's start date. Without one it
    // counts from when Week 1's assignment opened, so later runs line up with
    // earlier ones — and from today on the very first run.
    const week1 = await Assignment.findOne({ batchId: b._id, title: COURSEWORK[0].title }).select('startDate');
    const start = new Date(b.startDate || week1?.startDate || Date.now()).getTime();
    const schedule = (p) => ({ startDate: new Date(start + p.opensWeek * WEEK), dueDate: new Date(start + p.dueWeek * WEEK) });

    // Earlier titles first, so a renamed record is found below under its new
    // title instead of being created a second time. A dry run renames nothing,
    // so it remembers the record under its new title to report truthfully.
    // The old records carried stand-in deadlines; a rename puts them on the
    // course schedule along with the new title.
    const renamed = new Map();
    for (const [from, to] of Object.entries(RENAMED)) {
      const prev = await Assignment.findOne({ batchId: b._id, title: from });
      if (prev && !(await Assignment.exists({ batchId: b._id, title: to }))) {
        note(`- rename "${from}" → "${to}", on the course schedule`);
        if (WRITE) {
          Object.assign(prev, { title: to }, schedule(COURSEWORK.find((p) => p.title === to)));
          await prev.save();
        } else renamed.set(to, prev);
      }
    }
    for (const title of RETIRED) {
      const prev = await Assignment.findOne({ batchId: b._id, title });
      if (!prev) continue;
      const subs = await Submission.countDocuments({ assignmentId: prev._id });
      if (subs) {
        console.log(`  kept "${title}": ${subs} submission(s) on it — remove it from the admin once graded`);
      } else {
        note(`- remove retired assignment: ${title}`);
        if (WRITE) await Assignment.deleteOne({ _id: prev._id });
      }
    }

    // Upserted by title. Dates and media are set once, on creation: re-running
    // must not move a live deadline or detach an uploaded brief.
    for (const p of COURSEWORK) {
      const existing = (await Assignment.findOne({ batchId: b._id, title: p.title })) || renamed.get(p.title);
      if (!existing) {
        note(`- create ${p.type}: ${p.title}`);
        if (WRITE) {
          await Assignment.create({
            batchId: b._id,
            type: p.type,
            title: p.title,
            description: p.description,
            videoUrl: VIDEO,
            pdfUrl: PDF,
            ...schedule(p),
            requiredDriveTypes: p.requires,
          });
        }
        continue;
      }
      const sameTypes = (existing.requiredDriveTypes || []).join('|') === p.requires.join('|');
      const retiredPdf = existing.pdfUrl === RETIRED_PDF;
      if (existing.description !== p.description || existing.type !== p.type || !sameTypes || retiredPdf) {
        note(`- update ${p.type} brief: ${p.title}`);
        if (WRITE) {
          existing.description = p.description;
          existing.type = p.type;
          existing.requiredDriveTypes = p.requires;
          if (retiredPdf) existing.pdfUrl = PDF;
          await existing.save();
        }
      }
    }
  }

  // ── Report ──
  console.log('');
  if (changes === 0) {
    console.log('✅ No changes — the database already matches the curriculum source.');
  } else {
    console.log(`${WRITE ? 'Applied' : 'Would apply'} ${changes} change(s):`);
    for (const line of log) console.log(line);
    console.log('');
    console.log(WRITE ? '✅ Written.' : '🔎 Dry run — nothing was written. Re-run with --write to commit.');
  }
  process.exit(0);
}

run().catch((err) => { console.error('Claude seed failed:', err); process.exit(1); });

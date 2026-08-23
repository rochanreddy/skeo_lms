import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Program } from '../models/Program.js';
import { Assignment } from '../models/Assignment.js';
import { Session } from '../models/Session.js';
import { LibraryItem } from '../models/LibraryItem.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { myBatchIds } from '../utils/access.js';

const router = Router();

// Universal search — one query, every kind of thing the user is allowed to see.
// This backs ⌘K on the frontend: the palette used to only list nav destinations,
// which meant finding a lesson still took three clicks through the curriculum
// tree. Now one query reaches the actual content and lands you inside it.
//
// Everything here is scoped by role the same way the individual list endpoints
// are — a student can only ever match lessons in a published program of a batch
// they're enrolled in, and only admins match people.

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Where in the body the needle hit, as a short single-line excerpt. Gives the
// result row a reason for existing when the title alone doesn't contain the query.
function excerpt(text, rx, len = 96) {
  if (!text) return '';
  const flat = String(text).replace(/[#*`>_\-\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const at = flat.search(rx);
  if (at < 0) return flat.slice(0, len) + (flat.length > len ? '…' : '');
  const from = Math.max(0, at - 30);
  return (from > 0 ? '…' : '') + flat.slice(from, from + len).trim() + (from + len < flat.length ? '…' : '');
}

router.get('/', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [], q });

  const rx = new RegExp(escapeRx(q), 'i');
  const user = req.user;
  const isStudent = user.role === 'student';
  const results = [];

  // Which batches (and therefore which programs) this user can see at all.
  const batchIds = await myBatchIds(user);
  const batches = batchIds.length
    ? await Batch.find({ _id: { $in: batchIds } }).select('name programId')
    : [];
  const batchName = new Map(batches.map((b) => [String(b._id), b.name]));
  const myProgramIds = new Set(batches.map((b) => b.programId).filter(Boolean).map(String));

  // ── Lessons ──────────────────────────────────────────────────────────────
  // The curriculum is an embedded tree, so match at the document level then
  // walk it in JS to find the exact topic(s) and build a deep link.
  const programFilter = isStudent
    ? { published: true, _id: { $in: [...myProgramIds] } }
    : {};
  const programs = await Program.find({
    ...programFilter,
    $or: [
      { title: rx },
      { 'modules.chapters.topics.title': rx },
      { 'modules.chapters.topics.body': rx },
    ],
  }).select('title modules published');

  for (const p of programs) {
    for (const m of p.modules || []) {
      for (const c of m.chapters || []) {
        for (const t of c.topics || []) {
          const inTitle = rx.test(t.title || '');
          const inBody = rx.test(t.body || '');
          if (!inTitle && !inBody) continue;
          results.push({
            type: 'lesson',
            id: String(t._id),
            title: t.title,
            // Module name gives the lesson somewhere to sit in the student's head.
            subtitle: `${p.title} · ${String(m.title).split('·').pop().trim()}`,
            detail: inBody && !inTitle ? excerpt(t.body, rx) : '',
            to: `/app/learning?program=${p._id}&topic=${t._id}`,
            // Title hits beat body hits.
            rank: inTitle ? 0 : 2,
          });
        }
      }
    }
    if (rx.test(p.title)) {
      results.push({
        type: 'program',
        id: String(p._id),
        title: p.title,
        subtitle: `Programme · ${(p.modules || []).length} modules`,
        to: `/app/learning?program=${p._id}`,
        rank: 1,
      });
    }
  }

  // ── Assignments & projects ───────────────────────────────────────────────
  if (batchIds.length) {
    const assignments = await Assignment.find({
      batchId: { $in: batchIds },
      $or: [{ title: rx }, { description: rx }],
    })
      .sort({ dueDate: 1 })
      .limit(8);
    for (const a of assignments) {
      results.push({
        type: a.type === 'project' ? 'project' : 'assignment',
        id: String(a._id),
        title: a.title,
        subtitle: [batchName.get(String(a.batchId)), a.dueDate ? `due ${new Date(a.dueDate).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : null]
          .filter(Boolean).join(' · '),
        to: isStudent ? '/app/learning?tab=assignments' : '/app/programs',
        rank: 1,
      });
    }

    // ── Sessions ───────────────────────────────────────────────────────────
    const sessions = await Session.find({ batchId: { $in: batchIds }, title: rx })
      .sort({ startsAt: -1 })
      .limit(6);
    for (const s of sessions) {
      results.push({
        type: 'session',
        id: String(s._id),
        title: s.title,
        subtitle: `${new Date(s.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${batchName.get(String(s.batchId)) ? ` · ${batchName.get(String(s.batchId))}` : ''}`,
        to: isStudent ? '/app' : '/app/programs',
        rank: 2,
      });
    }
  }

  // ── Library ──────────────────────────────────────────────────────────────
  const items = await LibraryItem.find({ $or: [{ title: rx }, { description: rx }] }).limit(6);
  for (const it of items) {
    results.push({
      type: 'library',
      id: String(it._id),
      title: it.title,
      subtitle: `${it.category} · Library`,
      to: '/app/library',
      rank: 2,
    });
  }

  // ── People (admin only) ──────────────────────────────────────────────────
  if (user.role === 'admin') {
    const people = await User.find({
      role: 'student',
      $or: [{ fullName: rx }, { email: rx }],
    })
      .select('fullName email role')
      .limit(6);
    for (const p of people) {
      results.push({
        type: p.role,
        id: String(p._id),
        title: p.fullName || p.email,
        subtitle: `${p.role} · ${p.email}`,
        to: '/app/students',
        rank: 1,
      });
    }
  }

  // Title matches first, then earlier-in-the-title matches, then alphabetical —
  // so typing the start of a lesson name reliably puts it at the top.
  const pos = (t) => { const i = t.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? 999 : i; };
  results.sort((a, b) => a.rank - b.rank || pos(a.title) - pos(b.title) || a.title.localeCompare(b.title));

  res.json({ q, results: results.slice(0, 24) });
});

export default router;

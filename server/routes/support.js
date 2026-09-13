import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  SupportTicket,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  SUBJECT_MAX,
  BODY_MAX,
} from '../models/SupportTicket.js';
import { User } from '../models/User.js';
import { notify, notifyMany } from '../utils/notify.js';

const router = Router();

// The queue is scoped, never filtered client-side: a student's request for
// /support can only ever produce their own tickets.
const scopeFor = (user) => (user.role === 'admin' ? {} : { userId: user._id });

/** Owner or admin. Anything else has no business seeing the thread. */
const canSee = (user, ticket) => user.role === 'admin' || String(ticket.userId?._id || ticket.userId) === String(user._id);

/** Every admin except `exceptId` — who to wake when a ticket needs attention. */
async function adminIds(exceptId) {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  return admins.map((a) => a._id).filter((id) => String(id) !== String(exceptId));
}

// GET /api/skeo/support?status=open — the caller's tickets, or the whole
// queue for an admin. Threads travel with the list: they are a few messages
// each, so one read serves the list and every conversation in it.
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;
  const scope = scopeFor(req.user);
  const filter = TICKET_STATUSES.includes(status) ? { ...scope, status } : scope;

  const [tickets, byStatus] = await Promise.all([
    SupportTicket.find(filter)
      .populate('userId', 'fullName email role')
      .sort({ updatedAt: -1 })
      .limit(100),
    // Counts drive the queue's tabs, so they have to span every status —
    // they're counted over `scope`, not `filter`.
    SupportTicket.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) if (row._id in counts) counts[row._id] = row.n;

  res.json({ tickets, counts });
});

// POST /api/skeo/support { subject, category, message } — raise a request.
router.post(
  '/',
  requireAuth,
  // Keyed by account (see identify() in the middleware). A person with a real
  // problem opens one or two; this only ever catches a stuck client.
  rateLimit({ bucket: 'support-new', max: 10, windowMs: 60 * 60_000, message: 'Too many support requests. Try again later.' }),
  async (req, res) => {
    const subject = (req.body?.subject || '').trim();
    const message = (req.body?.message || '').trim();
    const category = req.body?.category;

    if (!subject) return res.status(400).json({ error: 'A subject is required.' });
    if (!message) return res.status(400).json({ error: 'Describe the issue so we can help.' });
    if (subject.length > SUBJECT_MAX) return res.status(400).json({ error: `Keep the subject under ${SUBJECT_MAX} characters.` });
    if (message.length > BODY_MAX) return res.status(400).json({ error: `Keep the message under ${BODY_MAX} characters.` });

    const ticket = await SupportTicket.create({
      userId: req.user._id,
      subject,
      category: TICKET_CATEGORIES.includes(category) ? category : 'Other',
      status: 'open',
      messages: [{ authorId: req.user._id, authorRole: req.user.role, body: message }],
    });

    const who = req.user.fullName || req.user.email;
    notifyMany(await adminIds(req.user._id), {
      type: 'support',
      text: `🛟 ${who} needs help: ${subject}`,
      link: '/app/support',
    });

    res.status(201).json({ ticket });
  },
);

// GET /api/skeo/support/:id — one thread, for a permalink or a refresh.
router.get('/:id', requireAuth, async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id).populate('userId', 'fullName email role');
  if (!ticket) return res.status(404).json({ error: 'Not found.' });
  // Someone else's ticket is not "forbidden", it is not theirs to know about.
  if (!canSee(req.user, ticket)) return res.status(404).json({ error: 'Not found.' });
  res.json({ ticket });
});

// POST /api/skeo/support/:id/messages { body } — reply in the thread.
router.post(
  '/:id/messages',
  requireAuth,
  rateLimit({ bucket: 'support-reply', max: 60, windowMs: 60 * 60_000, message: 'Too many replies. Try again later.' }),
  async (req, res) => {
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'A reply cannot be empty.' });
    if (body.length > BODY_MAX) return res.status(400).json({ error: `Keep the reply under ${BODY_MAX} characters.` });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found.' });
    if (!canSee(req.user, ticket)) return res.status(404).json({ error: 'Not found.' });

    ticket.messages.push({ authorId: req.user._id, authorRole: req.user.role, body });
    // Whoever just spoke, the ball is now in the other court — a reply on a
    // resolved ticket reopens it rather than disappearing into a closed thread.
    ticket.status = req.user.role === 'admin' ? 'answered' : 'open';
    await ticket.save();

    if (req.user.role === 'admin') {
      notify(ticket.userId, { type: 'support', text: `🛟 Support replied: ${ticket.subject}`, link: '/app/support' });
    } else {
      notifyMany(await adminIds(req.user._id), {
        type: 'support',
        text: `🛟 New reply: ${ticket.subject}`,
        link: '/app/support',
      });
    }

    await ticket.populate('userId', 'fullName email role');
    res.json({ ticket });
  },
);

// PATCH /api/skeo/support/:id { status } — an admin works the queue; the
// person who raised it can close it themselves once they're sorted, or
// reopen it if they aren't. Only an admin can say "answered".
router.patch('/:id', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found.' });
  if (!canSee(req.user, ticket)) return res.status(404).json({ error: 'Not found.' });
  if (req.user.role !== 'admin' && status === 'answered') {
    return res.status(403).json({ error: 'Only support can mark a request answered.' });
  }

  const changed = ticket.status !== status;
  ticket.status = status;
  await ticket.save();

  // Tell the person waiting, but only when an admin closed it — they didn't
  // do it themselves, so nothing else would say so.
  if (changed && status === 'resolved' && req.user.role === 'admin') {
    notify(ticket.userId, { type: 'support', text: `🛟 Resolved: ${ticket.subject}`, link: '/app/support' });
  }

  await ticket.populate('userId', 'fullName email role');
  res.json({ ticket });
});

export default router;

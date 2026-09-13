import mongoose from 'mongoose';

// A help request a user raises about the LMS itself — something broken, an
// account they can't get into, content that looks wrong. Admins answer them
// from the Support queue.
//
// The category is what the *user* says the problem is about; it only sorts the
// queue, so a wrong guess costs nothing.
export const TICKET_CATEGORIES = ['Technical', 'Course content', 'Account & access', 'Payment', 'Other'];

// open      — waiting on us
// answered  — an admin has replied, waiting on the user
// resolved  — done, by either side
export const TICKET_STATUSES = ['open', 'answered', 'resolved'];

export const SUBJECT_MAX = 140;
export const BODY_MAX = 4000;

// One turn in the thread. authorRole is stored rather than derived from the
// author's current role: it says who was speaking *then*, which is what the
// thread has to show, and it saves populating a user on every message.
const messageSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, enum: ['student', 'admin'], required: true },
    body: { type: String, required: true, trim: true, maxlength: BODY_MAX },
  },
  { timestamps: true },
);

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: SUBJECT_MAX },
    category: { type: String, enum: TICKET_CATEGORIES, default: 'Other' },
    status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },
    // The whole conversation, oldest first. Threads here are a handful of
    // messages, so they live on the ticket rather than in a collection of
    // their own — one read serves the list *and* every thread in it.
    messages: [messageSchema],
  },
  { timestamps: true },
);

// The two reads this collection gets, both "newest activity first": a user's
// own tickets, and the admin queue filtered by status. Serving the sort from
// the index keeps it off the in-memory path as the archive grows.
supportTicketSchema.index({ userId: 1, updatedAt: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema, 'skeo_support_tickets');

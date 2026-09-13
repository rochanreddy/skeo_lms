import mongoose from 'mongoose';

// A masterclass an admin puts in front of the whole school.
//
// The record is deliberately thin: a title, and the link to the masterclass's
// own landing page. That page is where the speaker, the agenda, the seats and
// the registration form already live, so re-keying any of it here would only
// create a second version to keep in sync — and the stale one would be ours.
//
// The date is optional for the same reason. Fill it in and the board can sort
// the schedule and say how far off a session is; leave it out and the card is
// simply a link that stays up.
const webinarSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    // The one field the feature exists for.
    landingUrl: { type: String, required: true },
    startsAt: { type: Date, default: null },
    // A line from the admin that isn't on the landing page — "open to all
    // cohorts", "seats are limited". Optional, and usually empty.
    note: { type: String, default: '' },

    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// One read, one shape: the whole board, newest push first, capped at 100. The
// client groups it by date, so the sort that has to come off an index is this
// one and not startsAt (which is null on any number of these).
webinarSchema.index({ createdAt: -1 });

export const Webinar = mongoose.model('Webinar', webinarSchema, 'skeo_webinars');

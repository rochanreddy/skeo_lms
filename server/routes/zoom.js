import { Router } from 'express';
import crypto from 'crypto';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';

// Zoom webhook — marks a student present when they ACTUALLY join the meeting.
// Zoom pushes a `meeting.participant_joined` event; we match it to a session by
// meeting id and to a student by email, then mark attendance. Verified with the
// app's Webhook Secret Token (Zoom Marketplace → your app → Feature → Webhook).
const router = Router();
const SECRET = () => process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';

function verify(req) {
  const ts = req.headers['x-zm-request-timestamp'];
  const sig = req.headers['x-zm-signature'];
  if (!ts || !sig || !SECRET() || !req.rawBody) return false;
  const message = `v0:${ts}:${req.rawBody.toString('utf8')}`;
  const hash = crypto.createHmac('sha256', SECRET()).update(message).digest('hex');
  return sig === `v0=${hash}`;
}

// POST /api/skeo/zoom/webhook  (public — Zoom calls this; secured by signature)
router.post('/webhook', async (req, res) => {
  const body = req.body || {};

  // 1) One-time URL validation handshake when you save the webhook in Zoom.
  if (body.event === 'endpoint.url_validation') {
    const plainToken = body.payload?.plainToken || '';
    const encryptedToken = crypto.createHmac('sha256', SECRET()).update(plainToken).digest('hex');
    return res.json({ plainToken, encryptedToken });
  }

  // 2) Verify every real event.
  if (!verify(req)) return res.status(401).json({ error: 'Invalid signature' });

  // 3) A participant joined → credit attendance.
  if (body.event === 'meeting.participant_joined') {
    try {
      const meetingId = String(body.payload?.object?.id || '').trim();
      const p = body.payload?.object?.participant || {};
      const email = String(p.email || '').toLowerCase().trim();
      if (meetingId && email) {
        const session = await Session.findOne({ zoomMeetingId: meetingId });
        const student = await User.findOne({ email, role: 'student' });
        if (session && student) {
          const batch = await Batch.findById(session.batchId).select('studentIds');
          const enrolled = batch && batch.studentIds.some((id) => id.toString() === student._id.toString());
          if (enrolled) {
            await Attendance.updateOne(
              { sessionId: session._id, studentId: student._id },
              { $set: { status: 'present', batchId: session.batchId } },
              { upsert: true },
            );
          }
        }
      }
    } catch (err) {
      console.error('zoom participant_joined error:', err.message);
    }
  }

  res.json({ ok: true }); // ack fast so Zoom doesn't retry
});

export default router;

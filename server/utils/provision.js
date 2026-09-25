import crypto from 'crypto';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { ProvisionedOrder } from '../models/ProvisionedOrder.js';
import { hashPassword } from './password.js';
import { appUrl } from './appUrl.js';
import { isMailConfigured, sendMail, trySendMail } from './email.js';
import { welcomeEmail } from './welcomeEmail.js';
import { playbooksEmail } from './playbooksEmail.js';
import { loadPlaybooks } from './playbooks.js';

/**
 * A paid website order → an LMS account, its batches, and the login mail —
 * and, for the playbooks, the mail that carries them.
 *
 * Called only by the website's server, after Cashfree has confirmed the money
 * (routes/provision.js checks the shared secret). Safe to call repeatedly for
 * one order — see models/ProvisionedOrder.js.
 */

/**
 * One LMS batch per tool, named after it. A tool's course on the website
 * unlocks the batch of the same name. Only the Claude Course is on sale today;
 * the rest are listed so each goes live the day its course does, with no
 * change here.
 */
export const TOOL_BATCHES = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  n8n: 'n8n',
  lovable: 'Lovable',
  antigravity: 'Antigravity',
};

/** What the website sells, as the LMS understands it. */
export const ITEMS = ['member', 'playbooks', 'library', ...Object.keys(TOOL_BATCHES)];

/**
 * Which batches an order unlocks. Pure, so it is tested without a database.
 *
 *  - member (Everything AI, ₹799) → every batch, and a standing entitlement to
 *    the ones created later (User.allAccess).
 *  - a tool's course              → the batch named after the tool.
 *  - playbooks, library           → no batch.
 *
 * Batches are matched by NAME, case-insensitively, because that is the one
 * thing an admin sees and sets. A course bought while its batch does not exist
 * still gets an account and a login mail; the order records a warning so the
 * enrolment can be made by hand rather than silently skipped.
 */
export function batchesFor(items, batches) {
  const set = new Set(items);
  const warnings = [];
  if (set.has('member')) {
    return { batchIds: batches.map((b) => String(b._id)), allAccess: true, warnings };
  }
  const ids = new Set();
  for (const [key, name] of Object.entries(TOOL_BATCHES)) {
    if (!set.has(key)) continue;
    const batch = batches.find((b) => String(b.name || '').trim().toLowerCase() === name.toLowerCase());
    if (batch) ids.add(String(batch._id));
    else warnings.push(`${name} course bought, but no batch is named "${name}" — enrol this student by hand.`);
  }
  return { batchIds: [...ids], allAccess: false, warnings };
}

/** The playbooks go out by mail: bought on their own, or as part of Everything AI. */
export const getsPlaybooks = (items) => items.includes('playbooks') || items.includes('member');

/**
 * Whether the order needs an LMS account. The playbooks are PDFs delivered by
 * mail, so an order of nothing else has no reason for a login — and a login
 * that opens onto an empty LMS would only confuse the buyer.
 */
export const needsAccount = (items) => items.some((i) => i !== 'playbooks');

/** Ten characters, none of them easy to misread (no 0/O, 1/l/I). */
export function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

// A 'processing' row older than this is taken to be a request that died —
// the server restarted mid-order — and may be picked up again.
const STALE_MS = 2 * 60 * 1000;

/** Take the lock on an order, or report why not. */
async function claimOrder({ orderId, email, items }) {
  try {
    return { order: await ProvisionedOrder.create({ orderId, email, items, status: 'processing' }) };
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  const existing = await ProvisionedOrder.findOne({ orderId });
  if (!existing) return { busy: true };
  if (existing.status === 'done') return { done: existing };
  const stale = existing.status === 'failed' || Date.now() - existing.updatedAt.getTime() > STALE_MS;
  if (!stale) return { busy: true };
  const order = await ProvisionedOrder.findOneAndUpdate(
    { _id: existing._id, status: existing.status, updatedAt: existing.updatedAt },
    { $set: { status: 'processing', error: '' } },
    { new: true },
  );
  return order ? { order } : { busy: true };
}

const summary = (o, batchNames = []) => ({
  ok: true,
  orderId: o.orderId,
  created: o.created,
  emailed: o.emailed,
  playbooksSent: o.playbooksSent,
  batches: batchNames,
  warnings: o.warnings,
});

export async function provisionOrder({ orderId, email, name = '', phone = '', items = [] }) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  const cleanItems = [...new Set(items)].filter((i) => ITEMS.includes(i));
  if (!orderId || !cleanEmail || !cleanItems.length) {
    const err = new Error('orderId, email and at least one known item are required.');
    err.status = 400;
    throw err;
  }

  const claim = await claimOrder({ orderId, email: cleanEmail, items: cleanItems });
  if (claim.done) {
    const names = (await Batch.find({ _id: { $in: claim.done.batchIds } }).select('name')).map((b) => b.name);
    return { ...summary(claim.done, names), replay: true };
  }
  if (claim.busy) {
    const err = new Error('This order is already being processed.');
    err.status = 409;
    throw err;
  }
  const { order } = claim;

  try {
    // No account and no way to tell the buyer how to reach it is worse than
    // failing: the order would read as done while the student waits for a mail
    // that cannot come. Failing leaves it for the website to retry once mail
    // is configured. Development still runs, logging the mail to the console.
    if (!isMailConfigured() && process.env.NODE_ENV === 'production') {
      throw new Error('No mail transport configured (set ZEPTOMAIL_TOKEN).');
    }

    const account = needsAccount(cleanItems);
    const wantsPlaybooks = getsPlaybooks(cleanItems) && !order.playbooksSent;
    // Read before anything is created: a missing PDF should stop the order
    // cold, not after an account and a login mail already exist.
    const playbooks = wantsPlaybooks ? await loadPlaybooks() : null;
    let batchNames = [];
    let displayName = String(name || '').trim();

    if (account) {
      const allBatches = await Batch.find().select('_id name');
      const { batchIds, allAccess, warnings } = batchesFor(cleanItems, allBatches);

      let user = await User.findOne({ email: cleanEmail });
      let password = null;

      if (!user) {
        password = tempPassword();
        user = await User.create({
          email: cleanEmail,
          fullName: displayName,
          phone: String(phone || '').trim(),
          role: 'student',
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        });
        order.created = true;
      } else if (order.created && !order.emailed && user.mustChangePassword) {
        // An earlier attempt at THIS order made the account and then failed
        // before the mail went out, so its password was never seen by anyone.
        // Mint a fresh one rather than send an "existing account" mail to
        // somebody who has never been given a way in.
        password = tempPassword();
        user.passwordHash = await hashPassword(password);
        await user.save();
      }
      displayName = user.fullName || displayName;

      if (user.role !== 'student') {
        warnings.push(`${cleanEmail} is a ${user.role} account — nothing was enrolled.`);
      } else {
        if (batchIds.length) {
          await Batch.updateMany({ _id: { $in: batchIds } }, { $addToSet: { studentIds: user._id } });
        }
        await User.updateOne(
          { _id: user._id },
          {
            ...(batchIds.length ? { $addToSet: { batchIds: { $each: batchIds } } } : {}),
            $set: {
              ...(allAccess ? { allAccess: true } : {}),
              ...(!user.phone && phone ? { phone: String(phone).trim() } : {}),
            },
          },
        );
        if (user.blocked?.lms) warnings.push(`${cleanEmail} is blocked from the LMS — the purchase was added, but they cannot sign in until an admin unblocks them.`);
      }

      order.userId = user._id;
      order.batchIds = batchIds;
      order.warnings = warnings;
      await order.save();
      batchNames = allBatches.filter((b) => batchIds.includes(String(b._id))).map((b) => b.name);

      // Once per order. Saved the moment it goes, so a retry after a failed
      // playbooks mail does not send the login a second time.
      if (!order.emailed) {
        const mail = welcomeEmail({
          fullName: displayName,
          email: cleanEmail,
          password,
          loginUrl: appUrl('/login'),
          batches: batchNames,
          allAccess,
          playbooks: getsPlaybooks(cleanItems),
        });
        const sent = await trySendMail({ to: cleanEmail, subject: mail.subject, text: mail.text, html: mail.html });
        if (!sent.emailed && !sent.dev) throw new Error(`Login mail not sent: ${sent.error || 'unknown error'}`);
        order.emailed = true;
        await order.save();
      }
    }

    if (playbooks) {
      const mail = playbooksEmail({ fullName: displayName, email: cleanEmail, titles: playbooks.titles });
      // sendMail rather than trySendMail: a failure here must fail the order,
      // so it is retried until the buyer actually has what they paid for.
      await sendMail({ to: cleanEmail, subject: mail.subject, text: mail.text, html: mail.html, attachments: playbooks.attachments });
      order.playbooksSent = true;
      await order.save();
    }

    order.status = 'done';
    await order.save();
    return summary(order, batchNames);
  } catch (err) {
    order.status = 'failed';
    order.error = String(err?.message || err).slice(0, 500);
    await order.save().catch(() => {});
    throw err;
  }
}

import crypto from 'crypto';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { ProvisionedOrder } from '../models/ProvisionedOrder.js';
import { hashPassword } from './password.js';
import { appUrl } from './appUrl.js';
import { isMailConfigured, trySendMail } from './email.js';
import { welcomeEmail } from './welcomeEmail.js';

/**
 * A paid website order → an LMS account, its batches, and the login mail.
 *
 * Called only by the website's server, after Cashfree has confirmed the money
 * (routes/provision.js checks the shared secret). Safe to call repeatedly for
 * one order — see models/ProvisionedOrder.js.
 */

/** What the website sells, as the LMS understands it. */
export const ITEMS = ['member', 'claude', 'playbooks', 'library'];

/**
 * Which batches an order unlocks. Pure, so it is tested without a database.
 *
 *  - member (Everything AI, ₹799) → every batch, and a standing entitlement to
 *    the ones created later (User.allAccess).
 *  - claude (Claude Course)       → the batch named "Claude".
 *  - playbooks, library           → no batch. They are resources rather than
 *    courses; the account is still made so the buyer can sign in.
 *
 * Batches are matched by NAME, case-insensitively, because that is the one
 * thing an admin sees and sets. A Claude Course bought while no batch is
 * called "Claude" still gets an account and a login mail; the order records a
 * warning so the enrolment can be made by hand rather than silently skipped.
 */
export function batchesFor(items, batches) {
  const set = new Set(items);
  const warnings = [];
  if (set.has('member')) {
    return { batchIds: batches.map((b) => String(b._id)), allAccess: true, warnings };
  }
  const ids = new Set();
  if (set.has('claude')) {
    const claude = batches.find((b) => String(b.name || '').trim().toLowerCase() === 'claude');
    if (claude) ids.add(String(claude._id));
    else warnings.push('Claude Course bought, but no batch is named "Claude" — enrol this student by hand.');
  }
  return { batchIds: [...ids], allAccess: false, warnings };
}

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

    const allBatches = await Batch.find().select('_id name');
    const { batchIds, allAccess, warnings } = batchesFor(cleanItems, allBatches);

    let user = await User.findOne({ email: cleanEmail });
    let password = null;

    if (!user) {
      password = tempPassword();
      user = await User.create({
        email: cleanEmail,
        fullName: String(name || '').trim(),
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

    const batchNames = allBatches.filter((b) => batchIds.includes(String(b._id))).map((b) => b.name);
    const mail = welcomeEmail({
      fullName: user.fullName || name,
      email: cleanEmail,
      password,
      loginUrl: appUrl('/login'),
      batches: batchNames,
      allAccess,
    });
    const sent = await trySendMail({ to: cleanEmail, subject: mail.subject, text: mail.text, html: mail.html });
    if (!sent.emailed && !sent.dev) throw new Error(`Login mail not sent: ${sent.error || 'unknown error'}`);

    order.emailed = true;
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

// Password hashing.
//
// @node-rs/bcrypt rather than bcryptjs. Same bcrypt algorithm, same `$2b$` hash
// format -- a hash written by either library verifies under the other, which is
// what made the swap a drop-in with no migration and no password resets -- but
// the work happens on a background thread instead of on the event loop.
//
// That distinction is the entire reason for this module. bcryptjs is pure
// JavaScript, so it runs on Node's single thread: one login held it for ~0.3s,
// and 100 simultaneous logins queued behind one another. Measured on the load
// test in loadtest/, the hundredth user waited 38 seconds, and while that was
// happening the server could not answer /health for up to 12s at a stretch --
// long enough for a platform health check to call the instance dead and restart
// it in the middle of a session. The identical burst through this module
// finishes in ~1.7s with /health still answering in 2ms.
//
// COST is 10, which is bcrypt's own default. Each step up doubles the work, so
// the 12 this used to run at cost four times as much per login; brute force is
// held off by the rate limit on failed attempts, not by that margin.
import { hash as bcryptHash, verify as bcryptVerify } from '@node-rs/bcrypt';

export const PASSWORD_COST = 10;

/** Hash a new or changed password. */
export const hashPassword = (plain) => bcryptHash(String(plain ?? ''), PASSWORD_COST);

/**
 * Check a password against a stored hash. Answers false — rather than throwing —
 * for an account with no hash, and for a stored value that is not a bcrypt hash
 * at all: that is a corrupt record, and a corrupt record is not a valid login.
 */
export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return await bcryptVerify(String(plain ?? ''), hash);
  } catch {
    return false;
  }
}

/**
 * The cost a stored hash was written at — bcrypt records it in the hash itself
 * (`$2b$12$...`), which is why hashes at the old cost keep verifying.
 */
export const costOf = (hash) => Number(String(hash || '').split('$')[2]) || 0;

/**
 * Should this hash be rewritten at the current cost? Every account that existed
 * before this module did is still at 12, and would go on paying four times the
 * price at every login forever. Checked on successful login, where the plaintext
 * is in hand for the only moment it ever will be.
 */
export const needsRehash = (hash) => costOf(hash) !== PASSWORD_COST;

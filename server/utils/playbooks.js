import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The playbook sets skeoai.com sells, delivered the way menler.in delivers its
 * own: by mail, every PDF attached, sent from the server once the payment is
 * confirmed.
 *
 *   claude — Claude Playbooks (₹99)
 *   ai     — AI Library (₹99): the AI playbooks
 *
 * Everything AI gets both. Each set is a folder under server/assets/playbooks/
 * holding the PDFs and a playbooks.json — [{ "title", "file" }] in the order
 * the mail lists them — so adding or swapping one is a file drop and a line of
 * JSON, not a code change.
 *
 * PLAYBOOKS_DIR points it elsewhere; the end-to-end test uses that so it never
 * has to put fixture files in the repo.
 */
export const PLAYBOOK_SETS = {
  claude: { label: 'Claude Playbooks', folder: 'claude' },
  ai: { label: 'AI Library', folder: 'ai' },
};

/** Which sets an order pays for. */
export function playbookSetsFor(items) {
  const set = new Set(items);
  const out = [];
  if (set.has('playbooks') || set.has('member')) out.push('claude');
  if (set.has('library') || set.has('member')) out.push('ai');
  return out;
}

/**
 * The most attachment bytes one mail may carry. ZeptoMail caps a whole mail
 * at about 15 MB and attachments grow by a third in transit (base64), so 8 MB
 * of PDF leaves room for the encoding and the body. A set larger than this —
 * the AI Library is 14 MB — goes out as numbered parts rather than as one mail
 * that bounces.
 */
export const MAX_MAIL_BYTES = 8 * 1024 * 1024;

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'playbooks');
const baseDir = () => process.env.PLAYBOOKS_DIR || DEFAULT_DIR;

/**
 * One set, read from disk: its label and its files. Throws if the set is
 * missing, empty, malformed or names a file that is not there — an order must
 * fail rather than send a mail with nothing in it.
 */
export async function loadPlaybookSet(key, from = baseDir()) {
  const def = PLAYBOOK_SETS[key];
  if (!def) throw new Error(`Unknown playbook set: ${key}`);
  const dir = path.join(from, def.folder);
  const raw = await fs.readFile(path.join(dir, 'playbooks.json'), 'utf8').catch(() => '[]');
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error(`assets/playbooks/${def.folder}/playbooks.json is not valid JSON.`);
  }
  if (!Array.isArray(list) || !list.length) throw new Error(`No ${def.label} are configured (assets/playbooks/${def.folder}).`);

  const files = await Promise.all(list.map(async ({ title, file }) => {
    // A bare filename only — nothing listed here may reach outside the folder.
    if (!title || !/^[\w.-]+\.pdf$/i.test(String(file || ''))) throw new Error(`Not a playbook entry: ${JSON.stringify({ title, file })}`);
    const content = await fs.readFile(path.join(dir, file)).catch(() => {
      throw new Error(`Playbook file missing: assets/playbooks/${def.folder}/${file}`);
    });
    return { title: String(title), filename: file, content, contentType: 'application/pdf' };
  }));
  return { key, label: def.label, files };
}

/**
 * Split a set's files into mails of at most `max` bytes each, keeping the
 * listed order. A single file larger than the cap still goes, alone.
 */
export function splitIntoMails(files, max = MAX_MAIL_BYTES) {
  const parts = [];
  let current = [];
  let size = 0;
  for (const f of files) {
    const n = f.content.length;
    if (current.length && size + n > max) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += n;
  }
  if (current.length) parts.push(current);
  return parts;
}

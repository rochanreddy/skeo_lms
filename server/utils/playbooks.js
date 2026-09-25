import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Claude Playbooks, as bought on skeoai.com (₹99, and included in
 * Everything AI). Delivered the way menler.in delivers its playbooks: one mail,
 * every PDF attached, sent from the server once the payment is confirmed.
 *
 * The set is server/assets/playbooks/playbooks.json — [{ "title", "file" }],
 * in the order the mail lists them — with the PDFs beside it. Adding or
 * swapping a playbook is a file drop and a line of JSON, not a code change.
 *
 * While that list is EMPTY a playbooks order fails rather than sending a mail
 * with nothing in it, so it is retried, not quietly marked done.
 *
 * PLAYBOOKS_DIR points it elsewhere; the end-to-end test uses that so it never
 * has to put fixture files in the repo.
 */
const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'playbooks');
const dir = () => process.env.PLAYBOOKS_DIR || DEFAULT_DIR;

/** The list, the titles for the mail, and the files as attachments. */
export async function loadPlaybooks(from = dir()) {
  const raw = await fs.readFile(path.join(from, 'playbooks.json'), 'utf8').catch(() => '[]');
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error('assets/playbooks/playbooks.json is not valid JSON.');
  }
  if (!Array.isArray(list) || !list.length) throw new Error('No playbooks are configured (assets/playbooks/playbooks.json).');

  const attachments = await Promise.all(list.map(async ({ title, file }) => {
    // A bare filename only — nothing listed here may reach outside the folder.
    if (!title || !/^[\w.-]+\.pdf$/i.test(String(file || ''))) throw new Error(`Not a playbook entry: ${JSON.stringify({ title, file })}`);
    const content = await fs.readFile(path.join(from, file)).catch(() => {
      throw new Error(`Playbook file missing: assets/playbooks/${file}`);
    });
    return { filename: file, content, contentType: 'application/pdf' };
  }));

  return { titles: list.map((p) => String(p.title)), attachments };
}

// Which batches a website order unlocks, and the temporary password it mints.
// Pure — no database, no server:
//
//   node --test tests/provision.test.js
//
// The database side (one account and one mail per order however many times it
// is delivered, existing passwords left alone) was proved against a real
// server on a throwaway database; see routes/provision.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { batchesFor, getsPlaybooks, needsAccount, tempPassword } from '../utils/provision.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadPlaybookSet, playbookSetsFor, splitIntoMails, MAX_MAIL_BYTES } from '../utils/playbooks.js';

const B = ['Claude', 'ChatGPT', 'Gemini', 'AI Coding'].map((name, i) => ({ _id: `b${i}`, name }));

test('Everything AI unlocks every batch, as a standing entitlement', () => {
  const r = batchesFor(['member'], B);
  assert.deepEqual(r.batchIds, ['b0', 'b1', 'b2', 'b3']);
  assert.equal(r.allAccess, true);
  assert.deepEqual(r.warnings, []);
});

test('Everything AI wins even when bought with other items', () => {
  assert.equal(batchesFor(['claude', 'member'], B).batchIds.length, 4);
});

test('the Claude Course unlocks the batch named Claude, matched case-insensitively', () => {
  const r = batchesFor(['claude'], [{ _id: 'x', name: '  claude ' }, ...B.slice(1)]);
  assert.deepEqual(r.batchIds, ['x']);
  assert.equal(r.allAccess, false);
});

test('a Claude Course with no Claude batch still succeeds, and says why nothing unlocked', () => {
  const r = batchesFor(['claude'], B.slice(1));
  assert.deepEqual(r.batchIds, []);
  assert.equal(r.warnings.length, 1);
});

test('playbooks and library unlock no batch', () => {
  assert.deepEqual(batchesFor(['playbooks', 'library'], B).batchIds, []);
});

test('temporary passwords are 10 unambiguous characters and do not repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const p = tempPassword();
    assert.match(p, /^[a-km-np-zA-HJ-NP-Z2-9]{10}$/);
    seen.add(p);
  }
  assert.equal(seen.size, 500);
});

test('each tool course unlocks the batch named after the tool', () => {
  const tools = ['Claude', 'ChatGPT', 'Gemini', 'n8n', 'Lovable', 'Antigravity'].map((name, i) => ({ _id: `t${i}`, name }));
  assert.deepEqual(batchesFor(['chatgpt'], tools).batchIds, ['t1']);
  assert.deepEqual(batchesFor(['n8n', 'antigravity'], tools).batchIds.sort(), ['t3', 't5']);
  assert.equal(batchesFor(['member'], tools).batchIds.length, 6);
});

test('which playbook sets an order gets, and which orders need no account', () => {
  assert.deepEqual(playbookSetsFor(['playbooks']), ['claude']);
  assert.deepEqual(playbookSetsFor(['library']), ['ai']);
  assert.deepEqual(playbookSetsFor(['member']), ['claude', 'ai'], 'Everything AI gets both');
  assert.deepEqual(playbookSetsFor(['claude']), []);
  assert.equal(getsPlaybooks(['claude']), false);
  assert.equal(needsAccount(['playbooks']), false);
  assert.equal(needsAccount(['library', 'playbooks']), false, 'mail-only purchases');
  assert.equal(needsAccount(['playbooks', 'claude']), true);
  assert.equal(needsAccount(['member']), true);
});

test('a missing, empty, malformed or escaping set fails rather than mailing nothing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skeo-pb-'));
  const dir = path.join(root, 'claude');
  await fs.mkdir(dir);
  const list = (entries) => fs.writeFile(path.join(dir, 'playbooks.json'), JSON.stringify(entries));
  await assert.rejects(loadPlaybookSet('claude', root), /No Claude Playbooks/, 'no list at all');
  await list([]);
  await assert.rejects(loadPlaybookSet('claude', root), /No Claude Playbooks/, 'empty list');
  await list([{ title: 'x', file: '../../.env' }]);
  await assert.rejects(loadPlaybookSet('claude', root), /Not a playbook entry/, 'path escape refused');
  await list([{ title: 'x', file: 'nope.pdf' }]);
  await assert.rejects(loadPlaybookSet('claude', root), /missing/);
  await assert.rejects(loadPlaybookSet('nope', root), /Unknown/);
  await fs.rm(root, { recursive: true, force: true });
});

test('a large set is split into mails under the cap, in order', () => {
  const f = (title, mb) => ({ title, content: Buffer.alloc(mb * 1024 * 1024) });
  const parts = splitIntoMails([f('a', 5.5), f('b', 0.7), f('c', 5.3), f('d', 1.5), f('e', 0.7)]);
  assert.deepEqual(parts.map((p) => p.map((x) => x.title)), [['a', 'b'], ['c', 'd', 'e']]);
  assert.deepEqual(splitIntoMails([f('huge', 12)]).length, 1, 'one oversize file still goes, alone');
});

// The real files, as shipped. Guards against a playbook being added that
// pushes a mail over the cap, or a listed file not being committed.
test('the shipped playbook sets load, and every mail stays under the cap', async () => {
  for (const [key, expectMails] of [['claude', 1], ['ai', 2]]) {
    const set = await loadPlaybookSet(key);
    assert.equal(set.files.length, 5, key);
    const mails = splitIntoMails(set.files);
    assert.equal(mails.length, expectMails, `${key} mails`);
    for (const m of mails) {
      const bytes = m.reduce((n, x) => n + x.content.length, 0);
      assert.ok(bytes <= MAX_MAIL_BYTES, `${key}: a mail of ${bytes} bytes`);
      for (const x of m) assert.equal(x.content.subarray(0, 5).toString(), '%PDF-', x.filename);
    }
  }
});

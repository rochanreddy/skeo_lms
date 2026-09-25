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
import { loadPlaybooks } from '../utils/playbooks.js';

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

test('playbooks go by mail, and a playbooks-only order needs no account', () => {
  assert.equal(getsPlaybooks(['playbooks']), true);
  assert.equal(getsPlaybooks(['member']), true, 'Everything AI includes them');
  assert.equal(getsPlaybooks(['claude']), false);
  assert.equal(needsAccount(['playbooks']), false);
  assert.equal(needsAccount(['playbooks', 'claude']), true);
  assert.equal(needsAccount(['member']), true);
});

test('no playbooks configured, or a bad or missing file, fails rather than mailing nothing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skeo-pb-'));
  const list = (entries) => fs.writeFile(path.join(dir, 'playbooks.json'), JSON.stringify(entries));
  await assert.rejects(loadPlaybooks(dir), /No playbooks/, 'no list at all');
  await list([]);
  await assert.rejects(loadPlaybooks(dir), /No playbooks/, 'empty list');
  await list([{ title: 'x', file: '../../.env' }]);
  await assert.rejects(loadPlaybooks(dir), /Not a playbook entry/, 'path escape refused');
  await list([{ title: 'x', file: 'nope.pdf' }]);
  await assert.rejects(loadPlaybooks(dir), /missing/);
  await fs.writeFile(path.join(dir, 'a.pdf'), '%PDF-1.4 a');
  await list([{ title: 'Playbook A', file: 'a.pdf' }]);
  const pb = await loadPlaybooks(dir);
  assert.deepEqual(pb.titles, ['Playbook A']);
  assert.equal(pb.attachments[0].contentType, 'application/pdf');
  await fs.rm(dir, { recursive: true, force: true });
});

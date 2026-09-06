import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeModules, idsOf } from '../utils/curriculumMerge.js';

// A curriculum source, as buildModules() would return it: no ids, because the
// author is describing content, not identity.
const source = () => [
  {
    title: 'M01 · Foundations',
    order: 0,
    description: '',
    chapters: [{
      title: 'Lessons',
      order: 0,
      description: '',
      pageLabel: '',
      topics: [
        { title: '1.1 · What Generative AI Is', contentType: 'video', body: '- a', order: 0, contentUrl: 'seed.mp4', readingUrl: 'seed.pdf' },
        { title: '1.2 · Tokens', contentType: 'video', body: '- b', order: 1, contentUrl: 'seed.mp4', readingUrl: 'seed.pdf' },
      ],
    }],
  },
];

// Stand in for what Mongoose does on a first save: mint an id for every node.
let seq = 0;
function withIds(mods) {
  return mods.map((m) => ({
    ...m,
    _id: `m${seq++}`,
    chapters: (m.chapters || []).map((c) => ({
      ...c,
      _id: `c${seq++}`,
      topics: (c.topics || []).map((t) => ({ ...t, _id: `t${seq++}` })),
    })),
  }));
}

test('re-authoring an unchanged curriculum reports nothing and keeps every id', () => {
  const stored = withIds(source());
  const before = idsOf(stored);

  const { modules, log } = mergeModules(stored, source());

  assert.deepEqual(log, [], 'a second run must report zero changes');
  const after = idsOf(modules);
  assert.deepEqual([...after.topics].sort(), [...before.topics].sort());
  assert.deepEqual([...after.modules].sort(), [...before.modules].sort());
});

test('merging is stable across repeated runs', () => {
  let tree = withIds(source());
  for (let i = 0; i < 3; i += 1) {
    const { modules, log } = mergeModules(tree, source());
    assert.deepEqual(log, [], `run ${i + 2} must be a no-op`);
    tree = modules;
  }
});

test('media an admin attached survives re-authoring', () => {
  const stored = withIds(source());
  // What an admin's VdoCipher upload and a swapped handout look like.
  Object.assign(stored[0].chapters[0].topics[0], {
    videoSource: 'vdocipher',
    vdoVideoId: '68e30f88fe384b1b958745f59d4e554b',
    readingUrl: 'https://cdn.example/real-handout.pdf',
    classLink: 'https://meet.example/week-1',
    notesUrl: 'https://cdn.example/deck.pptx',
  });

  const { modules } = mergeModules(stored, source());
  const lesson = modules[0].chapters[0].topics[0];

  assert.equal(lesson.vdoVideoId, '68e30f88fe384b1b958745f59d4e554b');
  assert.equal(lesson.videoSource, 'vdocipher');
  assert.equal(lesson.classLink, 'https://meet.example/week-1');
  assert.equal(lesson.notesUrl, 'https://cdn.example/deck.pptx');
  // The seeder's placeholder must not overwrite the real upload.
  assert.equal(lesson.readingUrl, 'https://cdn.example/real-handout.pdf');
});

test('the placeholder still seeds a lesson that has no media yet', () => {
  const { modules } = mergeModules([], source());
  const lesson = modules[0].chapters[0].topics[0];
  assert.equal(lesson.contentUrl, 'seed.mp4');
  assert.equal(lesson.readingUrl, 'seed.pdf');
});

test('editing a lesson body keeps its id, so completion ticks survive', () => {
  const stored = withIds(source());
  const originalId = stored[0].chapters[0].topics[0]._id;

  const edited = source();
  edited[0].chapters[0].topics[0].body = '- a, rewritten';

  const { modules, log } = mergeModules(stored, edited);
  assert.equal(modules[0].chapters[0].topics[0]._id, originalId);
  assert.equal(log.length, 1);
  assert.match(log[0], /~ lesson.*body/);
});

test('a renamed lesson is a new lesson, and the old id is reported dropped', () => {
  const stored = withIds(source());
  const before = idsOf(stored);

  const renamed = source();
  renamed[0].chapters[0].topics[0].title = '1.1 · Something else entirely';

  const { modules, log } = mergeModules(stored, renamed);
  const after = idsOf(modules);

  assert.match(log[0], /\+ lesson/);
  // The untouched second lesson keeps its id; the renamed one does not.
  assert.equal(modules[0].chapters[0].topics[1]._id, stored[0].chapters[0].topics[1]._id);
  const dropped = [...before.topics].filter((id) => !after.topics.has(id));
  assert.deepEqual(dropped, [stored[0].chapters[0].topics[0]._id]);
});

test('page text on a module or chapter is authored, not preserved', () => {
  const stored = withIds(source());
  const withPages = source();
  withPages[0].description = '## Objective\nShip something real.';
  withPages[0].chapters[0].description = '## Carries forward\nLast week you built X.';
  withPages[0].chapters[0].pageLabel = 'Brief';

  const { modules, log } = mergeModules(stored, withPages);

  assert.equal(modules[0].description, '## Objective\nShip something real.');
  assert.equal(modules[0].chapters[0].description, '## Carries forward\nLast week you built X.');
  assert.equal(modules[0].chapters[0].pageLabel, 'Brief');
  // Adding a page must not disturb the lessons beneath it.
  assert.equal(modules[0].chapters[0].topics[0]._id, stored[0].chapters[0].topics[0]._id);
  assert.equal(log.length, 2, 'one module change, one chapter change');
});

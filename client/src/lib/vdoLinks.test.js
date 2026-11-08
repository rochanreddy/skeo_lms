import { describe, expect, it, vi } from 'vitest';
import { isReady, lessonNumber, loadLibrary, videoProblems } from './vdoLinks.js';

const video = (id, title, status = 'ready') => ({ id, title, status });
const lesson = (title, vdoVideoId, over = {}) => ({ title, contentType: 'video', videoSource: 'vdocipher', vdoVideoId, ...over });
const tree = (...topics) => [{ title: 'Module 1', chapters: [{ title: 'Chapter', topics }] }];

const library = [
  video('new11', '1.1 What Generative AI Actually Is.mp4'),
  video('new12', '1.2 Tokens, Context Windows and Why Claude Forgets.mp4'),
  video('new14', '1.4 Steerability and Property Collisions.mp4', 'Processing'),
  video('sample', 'Sample Video'),
];

describe('lesson numbers', () => {
  it('reads the number a lesson or a file starts with', () => {
    expect(lessonNumber('1.1 · What Generative AI Actually Is')).toBe('1.1');
    expect(lessonNumber('1.1 What Generative AI Actually Is.mp4')).toBe('1.1');
    expect(lessonNumber('2.10 - Agents')).toBe('2.10');
    expect(lessonNumber('3 Recap')).toBe('3');
  });

  it('does not take 1.1 for 1.10, or a year for a lesson', () => {
    expect(lessonNumber('1.10 Wrap up')).toBe('1.10');
    expect(lessonNumber('Sample Video')).toBeNull();
    expect(lessonNumber('Module 2')).toBeNull();
    expect(lessonNumber('Module 3 Recap')).toBe('3.recap');
    expect(lessonNumber('Module 3 Recap.mp4')).toBe('3.recap');
    expect(lessonNumber('M03 Recap.mp4')).toBe('3.recap');
    expect(lessonNumber('3.0 · Module Intro')).toBe('3.0');
    expect(lessonNumber('2026report.mp4')).toBeNull();
    expect(lessonNumber('')).toBeNull();
    expect(lessonNumber(undefined)).toBeNull();
  });
});

describe('finding lessons that will not play', () => {
  it('flags an id from another account and finds its replacement', () => {
    const [p] = videoProblems(tree(lesson('1.1 · What Generative AI Actually Is', 'old11')), library);
    expect(p).toMatchObject({ mi: 0, ci: 0, ti: 0, videoId: 'old11', problem: 'missing' });
    expect(p.match.id).toBe('new11');
  });

  it('leaves a lesson alone when its video is in the account', () => {
    expect(videoProblems(tree(lesson('1.1 · Anything', 'new11')), library)).toEqual([]);
  });

  it('offers a video for a lesson that has none yet', () => {
    const [p] = videoProblems(tree(lesson('1.2 · Tokens', '')), library);
    expect(p.problem).toBe('empty');
    expect(p.match.id).toBe('new12');
  });

  it('says there is no match rather than guess', () => {
    const [p] = videoProblems(tree(lesson('Bonus: office hours', 'old99')), library);
    expect(p.match).toBeNull();
  });

  it('will not choose between two videos with the same number', () => {
    const twins = [...library, video('dup11', '1.1 What Generative AI (re-record).mp4')];
    const [p] = videoProblems(tree(lesson('1.1 · What Generative AI', 'old11')), twins);
    expect(p.match).toBeNull();
  });

  it('ignores readings, and counts every video lesson whatever source it was saved with', () => {
    const others = tree(
      { title: '1.1 Reading', contentType: 'text', vdoVideoId: 'old' },
      { title: '1.2 Saved as a plain link once', contentType: 'video', videoSource: 'url', contentUrl: 'https://x.test/a.mp4' },
    );
    const found = videoProblems(others, library);
    expect(found.map((p) => p.lesson)).toEqual(['1.2 Saved as a plain link once']);
    expect(found[0].problem).toBe('empty');
  });

  it('gives the position of each lesson so it can be fixed in place', () => {
    const modules = [
      { chapters: [{ topics: [lesson('1.1 · A', 'new11')] }] },
      { chapters: [{ topics: [] }, { topics: [lesson('1.0 · Intro', ''), lesson('1.2 · B', 'gone')] }] },
    ];
    expect(videoProblems(modules, library).map(({ mi, ci, ti }) => [mi, ci, ti])).toEqual([[1, 1, 0], [1, 1, 1]]);
  });

  it('copes with an empty curriculum or library', () => {
    expect(videoProblems([], library)).toEqual([]);
    expect(videoProblems(undefined, [])).toEqual([]);
    expect(videoProblems(tree(lesson('1.1 · A', 'x')), [])[0].match).toBeNull();
  });
});

describe('reading the library', () => {
  it('pages until a short page', async () => {
    const full = Array.from({ length: 60 }, (_, i) => video(`v${i}`, `t${i}`));
    const api = vi.fn()
      .mockResolvedValueOnce({ videos: full })
      .mockResolvedValueOnce({ videos: [video('last', '9.9 End')] });
    const all = await loadLibrary(api);
    expect(all).toHaveLength(61);
    expect(api.mock.calls.map(([p]) => p)).toEqual(['/videos?limit=60&page=1', '/videos?limit=60&page=2']);
  });

  it('knows a ready video from one still processing', () => {
    expect(isReady(library[0])).toBe(true);
    expect(isReady(library[2])).toBe(false);
  });
});

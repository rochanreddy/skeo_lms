import { describe, expect, it } from 'vitest';
import { addFrame, missingFrame } from './courseFrame.js';

const mod = (n, count) => ({
  title: `M0${n}`,
  chapters: [{ title: 'Lessons', topics: Array.from({ length: count }, (_, i) => ({ _id: `t${n}.${i + 1}`, title: `${n}.${i + 1} · Lesson ${i + 1}`, contentType: 'video', vdoVideoId: `v${n}${i}`, readingUrl: '/pdfs/c.pdf', order: i })) }],
});
const course = () => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mod(n, 3));
const titles = (m) => m.chapters[0].topics.map((t) => t.title);

describe('module intros and recaps', () => {
  it('finds intros missing on modules 1, 3, 4, 5, 6 and a recap missing on every module', () => {
    const f = missingFrame(course());
    expect(f.intros).toEqual([0, 2, 3, 4, 5]);
    expect(f.recaps).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(f.count).toBe(13);
  });

  it('adds them around the lessons already there, which keep their ids, videos and order', () => {
    const c = course();
    expect(addFrame(c)).toBe(13);
    expect(titles(c[0])).toEqual(['1.0 · Module Intro', '1.1 · Lesson 1', '1.2 · Lesson 2', '1.3 · Lesson 3', 'Module 1 Recap']);
    expect(titles(c[1])).toEqual(['2.1 · Lesson 1', '2.2 · Lesson 2', '2.3 · Lesson 3', 'Module 2 Recap']);
    expect(titles(c[5])[0]).toBe('6.0 · Module Intro');
    expect(titles(c[6])[0]).toBe('7.1 · Lesson 1');
    const t = c[0].chapters[0].topics;
    expect(t.map((x) => x.order)).toEqual([0, 1, 2, 3, 4]);
    expect(t[1]._id).toBe('t1.1');
    expect(t[1].vdoVideoId).toBe('v10');
    expect(t[0]).toMatchObject({ contentType: 'video', videoSource: 'vdocipher', vdoVideoId: '', readingUrl: '/pdfs/c.pdf' });
    expect(t[4].body).toContain('- 1.3 Lesson 3');
    expect(t[4].body).not.toContain('Module Intro');
  });

  it('adds nothing the second time', () => {
    const c = course();
    addFrame(c);
    expect(missingFrame(c).count).toBe(0);
    expect(addFrame(c)).toBe(0);
  });

  it('counts an intro or recap an admin already wrote by hand', () => {
    const c = course();
    c[0].chapters[0].topics.unshift({ title: 'Module intro: welcome' });
    c[1].chapters[0].topics.push({ title: 'Module 02 – Recap' });
    const f = missingFrame(c);
    expect(f.intros).not.toContain(0);
    expect(f.recaps).not.toContain(1);
  });
});

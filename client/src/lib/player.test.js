import { describe, expect, it } from 'vitest';
import {
  bufferedEnd, formatTime, keyAction, readPosition, readRate, resumePoint, spokenTime, stepRate, writePosition, writeRate,
} from './player.js';

describe('time', () => {
  it('reads like a clock', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(83.9)).toBe('1:23');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-4)).toBe('0:00');
  });

  it('can be read out', () => {
    expect(spokenTime(0)).toBe('0 seconds');
    expect(spokenTime(61)).toBe('1 minute 1 second');
    expect(spokenTime(3720)).toBe('1 hour 2 minutes');
  });
});

describe('buffered', () => {
  const ranges = (list) => ({ length: list.length, start: (i) => list[i][0], end: (i) => list[i][1] });

  it('reads the range the playhead is in', () => {
    expect(bufferedEnd(ranges([[0, 30], [60, 90]]), 10)).toBe(30);
    expect(bufferedEnd(ranges([[0, 30], [60, 90]]), 70)).toBe(90);
    expect(bufferedEnd(ranges([[0, 30], [60, 90]]), 45)).toBe(30);
  });

  it('takes a plain array too, and nothing at all', () => {
    expect(bufferedEnd([{ start: 0, end: 12 }], 3)).toBe(12);
    expect(bufferedEnd(undefined)).toBe(0);
    expect(bufferedEnd(ranges([]))).toBe(0);
  });
});

describe('picking up where a student left off', () => {
  it('resumes from the middle', () => {
    expect(resumePoint(120, 300)).toBe(120);
  });
  it('starts over near the beginning or the end', () => {
    expect(resumePoint(4, 300)).toBe(0);
    expect(resumePoint(290, 300)).toBe(0);
  });
  it('copes with not knowing', () => {
    expect(resumePoint(120, NaN)).toBe(0);
    expect(resumePoint('x', 300)).toBe(0);
  });
});

describe('keys', () => {
  it('maps the ones every player uses', () => {
    expect(keyAction(' ')).toEqual({ type: 'toggle' });
    expect(keyAction('k')).toEqual({ type: 'toggle' });
    expect(keyAction('ArrowRight')).toEqual({ type: 'seek', by: 5 });
    expect(keyAction('j')).toEqual({ type: 'seek', by: -10 });
    expect(keyAction('m')).toEqual({ type: 'mute' });
    expect(keyAction('f')).toEqual({ type: 'fullscreen' });
    expect(keyAction('5')).toEqual({ type: 'seekTo', fraction: 0.5 });
    expect(keyAction('>')).toEqual({ type: 'rate', step: 1 });
    expect(keyAction('.', { shift: true })).toEqual({ type: 'rate', step: 1 });
  });
  it('leaves other keys to the page', () => {
    expect(keyAction('Tab')).toBeNull();
    expect(keyAction('.')).toBeNull();
    expect(keyAction('a')).toBeNull();
  });
});

describe('speed', () => {
  it('steps through the list and stops at the ends', () => {
    expect(stepRate(1, 1)).toBe(1.25);
    expect(stepRate(2, 1)).toBe(2);
    expect(stepRate(0.75, -1)).toBe(0.75);
    expect(stepRate(3, 1)).toBe(1.25); // an unknown rate steps from normal
  });

  it('remembers the chosen speed, and only a real one', () => {
    writeRate(1.5);
    expect(readRate()).toBe(1.5);
    localStorage.setItem('skeo_vrate', '7');
    expect(readRate()).toBe(1);
  });
});

describe('positions', () => {
  it('are kept per video, in whole seconds', () => {
    writePosition('abc', 71.8);
    expect(readPosition('abc')).toBe(71);
    expect(readPosition('other')).toBe(0);
  });
});

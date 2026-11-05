import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearApiCache } from '../api.js';

// jsdom has no matchMedia, and pwa.js asks it whether the app is installed.
window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearApiCache();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

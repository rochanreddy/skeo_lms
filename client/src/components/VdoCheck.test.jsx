import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiCache } from '../api.js';
import { fakeServer, json, signIn } from '../test/server.js';
import VdoCheck from './VdoCheck.jsx';
import { forgetLibrary } from '../lib/vdoLinks.js';

const LIBRARY = '/videos?limit=60&page=1';
const videos = [
  { id: 'new11', title: '1.1 What Generative AI Actually Is.mp4', status: 'ready' },
  { id: 'new12', title: '1.2 Tokens and Context.mp4', status: 'Processing' },
];
const lesson = (title, vdoVideoId) => ({ title, contentType: 'video', videoSource: 'vdocipher', vdoVideoId });
const modules = (...topics) => [{ title: 'Module 1', chapters: [{ title: 'Basics', topics }] }];

function show(tree, routes = { [LIBRARY]: { videos } }) {
  fakeServer(routes);
  const onLink = vi.fn();
  const onOpen = vi.fn();
  const view = render(<VdoCheck modules={tree} onLink={onLink} onOpen={onOpen} />);
  return { onLink, onOpen, ...view };
}

beforeEach(() => {
  signIn({ id: 'a1', role: 'admin', fullName: 'Admin' });
  clearApiCache();
  forgetLibrary();
});

describe('the video check', () => {
  it('says which lessons will not play, and what would fix them', async () => {
    show(modules(lesson('1.1 · What Generative AI', 'old11'), lesson('1.2 · Tokens', 'old12')));
    expect(await screen.findByText('2 video lessons will not play for students.')).toBeTruthy();
    expect(screen.getAllByText('Not in this account')).toHaveLength(2);
    expect(screen.getByText('1.1 What Generative AI Actually Is.mp4')).toBeTruthy();
    expect(screen.getByText('still processing')).toBeTruthy();
  });

  it('links only what it matched, and leaves saving to the admin', async () => {
    const { onLink } = show(modules(lesson('1.1 · What Generative AI', 'old11'), lesson('Bonus session', 'old99')));
    fireEvent.click(await screen.findByRole('button', { name: 'Link 1 matching video' }));
    expect(onLink).toHaveBeenCalledTimes(1);
    const [linked] = onLink.mock.calls[0];
    expect(linked.map((p) => [p.lesson, p.match.id])).toEqual([['1.1 · What Generative AI', 'new11']]);
    expect(screen.getByText('No match. Open it and pick from the library.')).toBeTruthy();
  });

  it('opens a lesson from the list', async () => {
    const { onOpen } = show(modules(lesson('Bonus session', 'old99')));
    fireEvent.click(await screen.findByRole('button', { name: 'Bonus session' }));
    expect(onOpen.mock.calls[0][0]).toMatchObject({ mi: 0, ci: 0, ti: 0 });
  });

  it('says nothing when every lesson plays', async () => {
    const { container } = show(modules(lesson('1.1 · A', 'new11')));
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await new Promise((r) => { setTimeout(r, 0); });
    expect(container.textContent).toBe('');
  });

  it('points at the server when the key does not work', async () => {
    show(modules(lesson('1.1 · A', 'new11')), { [LIBRARY]: json({ error: 'Video service error (403).' }, 502) });
    expect(await screen.findByText('Could not read the VdoCipher library.')).toBeTruthy();
    expect(screen.getByText(/Check VDOCIPHER_API_SECRET on the server/)).toBeTruthy();
  });
});

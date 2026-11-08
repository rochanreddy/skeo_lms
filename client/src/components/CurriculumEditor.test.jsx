import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiCache } from '../api.js';
import { fakeServer, signIn } from '../test/server.js';
import CurriculumEditor from './CurriculumEditor.jsx';
import { forgetLibrary } from '../lib/vdoLinks.js';

vi.mock('./CourseWork.jsx', () => ({ ProjectsManager: () => null, QuizzesManager: () => null }));
vi.mock('./VdoLibrary.jsx', () => ({ default: ({ onPick }) => <button onClick={() => onPick({ id: 'newvid00', title: 'Fresh upload', status: 'Queued' })}>pick fresh upload</button> }));

const admin = { id: 'a1', role: 'admin', fullName: 'Admin', email: 'admin@example.com' };
const lesson = (title, extra = {}) => ({ _id: title, title, contentType: 'video', videoSource: 'vdocipher', body: '', ...extra });
const program = {
  _id: 'p1', title: 'Claude', published: true,
  modules: [{ title: 'M01', chapters: [{ title: 'Lessons', topics: [
    lesson('1.1 · What Generative AI Actually Is', { vdoVideoId: 'ready001' }),
    lesson('1.2 · Tokens', { vdoVideoId: 'proc0002' }),
    lesson('1.3 · Hallucinations', { vdoVideoId: '', contentUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/x.mp4' }),
    lesson('1.4 · Old account', { vdoVideoId: 'gone0004' }),
  ] }] }],
};
const library = [
  { id: 'ready001', title: '1.1 What Generative AI Actually Is.mp4', status: 'ready', length: 333 },
  { id: 'proc0002', title: '1.2 Tokens.mp4', status: 'Queued' },
];

function show(configured = true) {
  return fakeServer({
    '/programs/p1': { program },
    '/batches': { batches: [] },
    '/videos/config': { configured },
    '/videos?limit=60&page=1': { videos: library },
  });
}

beforeEach(() => { signIn(admin); clearApiCache(); forgetLibrary(); show(); });

describe('the curriculum editor and its videos', () => {
  it('shows each video lesson’s state in the tree and counts what is attached', async () => {
    render(<CurriculumEditor programId="p1" onClose={() => {}} />);
    expect(await screen.findByText(/3\/4 videos attached/)).toBeTruthy();
    expect(await screen.findByLabelText('Ready')).toBeTruthy();
    expect(screen.getByLabelText('Processing')).toBeTruthy();
    expect(screen.getByLabelText('No video yet')).toBeTruthy();
    expect(screen.getByLabelText('Not in this VdoCipher account')).toBeTruthy();
  });

  it('names the attached video and its length instead of showing an id', async () => {
    render(<CurriculumEditor programId="p1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('1.1 · What Generative AI Actually Is'));
    await screen.findByLabelText('Ready');
    const card = document.querySelector('.ce-video');
    expect(card.textContent).toContain('1.1 What Generative AI Actually Is.mp4');
    expect(card.textContent).toContain('Ready · 5m 33s');
    expect(within(card).getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('says what students see when a lesson has no video, and never offers a URL field', async () => {
    render(<CurriculumEditor programId="p1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('1.3 · Hallucinations'));
    expect(screen.getByText('No video yet.')).toBeTruthy();
    expect(document.querySelector('.ce-video').textContent).toContain('video is on its way');
    expect(screen.queryByText(/Direct URL/)).toBeNull();
    expect(screen.queryByText(/Class link/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose or upload a video' })).toBeTruthy();
  });

  it('attaches a fresh upload and clears the stale link, then wants a save', async () => {
    render(<CurriculumEditor programId="p1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('1.3 · Hallucinations'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose or upload a video' }));
    fireEvent.click(screen.getByText('pick fresh upload'));
    const card = document.querySelector('.ce-video');
    expect(card.textContent).toContain('Fresh upload');
    expect(card.textContent).toContain('Processing');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.getByText(/4\/4 videos attached/)).toBeTruthy();
  });

  it('flags a video from another account for what it is', async () => {
    render(<CurriculumEditor programId="p1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('1.4 · Old account'));
    await screen.findByLabelText('Not in this VdoCipher account');
    expect(document.querySelector('.ce-video').textContent).toContain('belongs to another account');
  });

  it('explains when video hosting is not set up', async () => {
    show(false);
    render(<CurriculumEditor programId="p1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('1.3 · Hallucinations'));
    expect(screen.getByText('Video hosting is not set up on the server.')).toBeTruthy();
  });
});

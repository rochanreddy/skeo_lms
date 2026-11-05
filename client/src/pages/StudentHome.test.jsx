import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import StudentHome from './StudentHome.jsx';
import { fakeServer, student } from '../test/server.js';

const topics = [{ _id: 't1', title: 'One' }, { _id: 't2', title: 'Two' }];
const modules = [{ _id: 'm1', title: 'Module one', chapters: [{ _id: 'c1', title: 'Lessons', topics }] }];
const claude = { _id: 'p1', title: 'Claude', modules };
const other = { _id: 'p2', title: 'Other', modules };

const base = {
  '/batches': { batches: [{ id: 'b1', programId: 'p1' }] },
  '/programs': { programs: [claude] },
  '/assignments?scope=mine': { assignments: [] },
  '/announcements': { announcements: [] },
  '/notifications': { items: [] },
};

function open() {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ user: student }} />}>
          <Route path="/" element={<StudentHome />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const settled = () => screen.findByText(/of 2 lessons/);

describe('the requests behind the first screen', () => {
  it('fetches progress with everything else, in one wave', async () => {
    const server = fakeServer({ ...base, '/progress/me': { programId: 'p1', completedTopics: ['t1'] } });
    open();
    // Before anything has answered, all six are already out.
    expect(server.paths()).toEqual(expect.arrayContaining([
      '/batches', '/programs', '/assignments?scope=mine', '/announcements', '/notifications', '/progress/me',
    ]));
    await settled();
  });

  it('asks nothing more when the server chose the programme this screen chose', async () => {
    const server = fakeServer({ ...base, '/progress/me': { programId: 'p1', completedTopics: ['t1'] } });
    open();
    await settled();
    expect(server).toHaveBeenCalledTimes(6);
  });

  it('asks again, by id, when the two disagree', async () => {
    const server = fakeServer({
      ...base,
      '/batches': { batches: [] },
      '/programs': { programs: [other] },
      '/progress/me': { programId: 'p1', completedTopics: [] },
      '/progress/me?programId=p2': { programId: 'p2', completedTopics: ['t1'] },
    });
    open();
    await settled();
    await waitFor(() => expect(server.paths()).toContain('/progress/me?programId=p2'));
  });

  it('still recovers when /progress/me fails on its own', async () => {
    const server = fakeServer({
      ...base,
      '/progress/me?programId=p1': { programId: 'p1', completedTopics: [] },
    }); // bare /progress/me is unlisted, so it 404s
    open();
    await settled();
    await waitFor(() => expect(server.paths()).toContain('/progress/me?programId=p1'));
  });

  it('fetches a programme in full only when the list arrived without its tree', async () => {
    const server = fakeServer({
      ...base,
      '/programs': { programs: [{ _id: 'p1', title: 'Claude' }] },
      '/programs/p1': { program: claude },
      '/progress/me': { programId: 'p1', completedTopics: [] },
    });
    open();
    await settled();
    await waitFor(() => expect(server.paths()).toContain('/programs/p1'));
  });
});

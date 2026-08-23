import { lazy } from 'react';
import Placeholder from './components/Placeholder.jsx';

// Every destination is code-split: a role only downloads the screens it can
// reach, and the heavy ones (lesson player, curriculum editor, PDF reader) load
// on navigation rather than at first paint. AppShell wraps the Outlet in a
// Suspense boundary that shows a fallback while a chunk arrives.
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Learning = lazy(() => import('./pages/Learning.jsx'));
const ProgramsManage = lazy(() => import('./pages/ProgramsManage.jsx'));
const StudentHome = lazy(() => import('./pages/StudentHome.jsx'));
const StudentGrades = lazy(() => import('./pages/StudentGrades.jsx'));
const AdminBatches = lazy(() => import('./pages/admin/Batches.jsx'));
const Forum = lazy(() => import('./pages/Forum.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const Webinar = lazy(() => import('./pages/admin/Webinar.jsx'));
const AdminHome = lazy(() => import('./pages/admin/Home.jsx'));
const AdminStudents = lazy(() => import('./pages/admin/Students.jsx'));
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail.jsx'));

// A placeholder page factory — renders the spec's sections for screens whose
// backend is Phase 2.
const ph = (title, sections, blurb) => () => <Placeholder title={title} sections={sections} blurb={blurb} />;

const S = (title, detail) => ({ title, detail });

// Routes that exist for a role but don't get a sidebar tab (detail/drill-down
// pages reached by clicking into a list). Same {path, Component} shape as tabs.
export function extraRoutesFor(role) {
  if (role === 'admin') {
    return [{ path: 'students/:id', Component: AdminStudentDetail }];
  }
  return [];
}

// Each role's nav tabs. path '' is the index (Home). label drives the sidebar;
// Component drives the route. Kept in one place so nav + routing never drift.
export function navFor(role) {
  switch (role) {
    case 'student':
      return [
        { label: 'Home', path: '', Component: StudentHome },
        { label: 'Learning', path: 'learning', Component: Learning },
        { label: 'Grades', path: 'grades', Component: StudentGrades },
        { label: 'Library', path: 'library', Component: Library },
        { label: 'Forum', path: 'forum', Component: Forum },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    case 'admin':
      return [
        { label: 'Home', path: '', Component: AdminHome },
        { label: 'Programs', path: 'programs', Component: ProgramsManage },
        { label: 'Batches', path: 'batches', Component: AdminBatches },
        { label: 'Students', path: 'students', Component: AdminStudents },
        { label: 'Library', path: 'library', Component: Library },
        { label: 'Webinar', path: 'webinar', Component: Webinar },
        { label: 'Forum', path: 'forum', Component: ph('Forum', [
          S('Announcements', 'Global'), S('Moderation', 'Remove content across batches'),
        ]) },
        { label: 'Account', path: 'account', Component: Profile },
      ];
    // Unknown/retired roles (legacy 'mentor' or 'partner' accounts) get no tabs — App
    // treats an empty nav as "no access" rather than rendering a blank shell.
    default:
      return [];
  }
}

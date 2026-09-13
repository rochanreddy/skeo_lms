import { lazy } from 'react';

// Every destination is code-split: a role only downloads the screens it can
// reach, and the heavy ones (lesson player, curriculum editor, PDF reader) load
// on navigation rather than at first paint. AppShell wraps the Outlet in a
// Suspense boundary that shows a fallback while a chunk arrives.
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Learning = lazy(() => import('./pages/Learning.jsx'));
const ProgramsManage = lazy(() => import('./pages/ProgramsManage.jsx'));
const StudentHome = lazy(() => import('./pages/StudentHome.jsx'));
const StudentGrades = lazy(() => import('./pages/StudentGrades.jsx'));
const AdminCourse = lazy(() => import('./pages/admin/Batches.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const JobBoard = lazy(() => import('./pages/JobBoard.jsx'));
const AdminHome = lazy(() => import('./pages/admin/Home.jsx'));
const AdminStudents = lazy(() => import('./pages/admin/Students.jsx'));
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const AdminSupport = lazy(() => import('./pages/admin/Support.jsx'));

// Routes that exist for a role but don't get a dock tab (detail/drill-down
// pages reached by clicking into a list). Same {path, Component} shape as tabs.
// Profile lives here rather than in the dock: it's an account setting, not a
// section of the product, and the avatar menu is where people go looking for it.
// Support is here for the same reason, from the other direction: a student only
// wants it on the day something is broken, so it sits in the avatar menu (and
// in ⌘K) rather than taking a permanent seat in the dock. For an admin it IS a
// section of the product — a queue to work — so there it's a tab.
export function extraRoutesFor(role) {
  if (role === 'admin') {
    return [
      { path: 'students/:id', Component: AdminStudentDetail },
      { path: 'account', Component: Profile },
    ];
  }
  return [
    { path: 'profile', Component: Profile },
    { path: 'support', Component: Support },
  ];
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
        { label: 'Job Board', path: 'jobs', Component: JobBoard },
      ];
    case 'admin':
      return [
        { label: 'Home', path: '', Component: AdminHome },
        { label: 'Programs', path: 'programs', Component: ProgramsManage },
        { label: 'Course', path: 'course', Component: AdminCourse },
        { label: 'Students', path: 'students', Component: AdminStudents },
        { label: 'Support', path: 'support', Component: AdminSupport },
        { label: 'Library', path: 'library', Component: Library },
        { label: 'Job Board', path: 'jobs', Component: JobBoard },
      ];
    // Unknown/retired roles (legacy 'mentor' or 'partner' accounts) get no tabs — App
    // treats an empty nav as "no access" rather than rendering a blank shell.
    default:
      return [];
  }
}

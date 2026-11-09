import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ALL_NAV_ITEMS } from '@/config/navigation';
import DashboardPage from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import ModulePage from '@/pages/ModulePage';
import NotFoundPage from '@/pages/NotFoundPage';
import ReportsPage from '@/pages/ReportsPage';
import { ProtectedRoute } from './ProtectedRoute';

// Routes already implemented; every other nav item falls back to ModulePage.
const implemented = new Set(['/dashboard', '/reports']);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [{
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardPage /> },
        { path: 'reports', element: <ReportsPage /> },
        { path: 'reports/:slug', element: <ModulePage /> },
        ...ALL_NAV_ITEMS.filter((i) => !i.action && !implemented.has(i.path)).map((i) => ({ path: i.path.slice(1), element: <ModulePage /> })),
        { path: '*', element: <NotFoundPage /> },
      ],
    }],
  },
]);

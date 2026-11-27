import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { isPortalUser } from '@/features/portal/shared';
import { useAuth } from '@/store/auth';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  // Students and parents never see the staff application.
  if (isPortalUser(user)) return <Navigate to="/portal" replace />;
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[272px]">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

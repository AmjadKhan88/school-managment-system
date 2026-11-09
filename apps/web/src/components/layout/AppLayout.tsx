import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [open, setOpen] = useState(false);
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

import { Bell, CalendarDays, ChevronDown, LogOut, Menu, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLogout } from '@/hooks/useLogout';
import { useAuth } from '@/store/auth';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, sessionId, setSession } = useAuth();
  const [menu, setMenu] = useState(false);
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink-900">
          <CalendarDays size={16} className="text-brand-600" />
          <span className="sr-only">Academic session</span>
          <select value={sessionId ?? ''} onChange={(e) => setSession(e.target.value)} className="bg-transparent pr-1 focus:outline-none">
            {user?.sessions.length === 0 && <option value="">No session</option>}
            {user?.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications"><Bell size={19} /></button>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={menu}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{user?.fullName?.[0]?.toUpperCase()}</span>
            <ChevronDown size={14} className="text-slate-500" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-lift">
              <div className="px-3 py-2"><p className="truncate text-sm font-semibold">{user?.fullName}</p><p className="truncate text-xs text-slate-500">{user?.email}</p></div>
              <Link to="/account/password" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><UserRound size={16} />Change password</Link>
              <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><LogOut size={16} />Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

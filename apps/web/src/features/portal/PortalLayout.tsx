import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  GraduationCap,
  Home,
  KeyRound,
  LogOut,
  NotebookPen,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useLogout } from "@/hooks/useLogout";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { useChildren, usePortalStore } from "./shared";
import { useUnreadNotices } from "@/features/communication/shared";

const NAV = [
  { to: "/portal", label: "Home", icon: Home, end: true },
  { to: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/portal/fees", label: "Fees", icon: Wallet },
  { to: "/portal/results", label: "Results", icon: Trophy },
  { to: "/portal/timetable", label: "Timetable", icon: CalendarClock },
  { to: "/portal/homework", label: "Homework", icon: NotebookPen },
  { to: "/portal/leaves", label: "Leave", icon: CalendarOff },
  { to: "/portal/library", label: "Library", icon: BookOpen },
  { to: "/portal/profile", label: "Profile", icon: UserRound },
  { to: "/portal/notices", label: "Notices", icon: Bell },
];

export function PortalLayout() {
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  const kids = useChildren();
  const unread = useUnreadNotices();
  const { studentId, setStudentId } = usePortalStore();
  if (!user) return <Navigate to="/login" replace />;
  const selected =
    kids.data?.find((k) => k.id === studentId)?.id ?? kids.data?.[0]?.id ?? "";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
              <GraduationCap size={20} />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-ink-950">
                {user.school.name}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                {user.roles[0]?.slug === "student"
                  ? "Student portal"
                  : "Parent portal"}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {kids.data && kids.data.length > 1 && (
              <select
                aria-label="Student"
                className="input w-auto py-1.5 font-semibold"
                value={selected}
                onChange={(e) => setStudentId(e.target.value)}
              >
                {kids.data.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.fullName}
                  </option>
                ))}
              </select>
            )}
            <NavLink
              to="/portal/password"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Change password"
              title="Change password"
            >
              <KeyRound size={18} />
            </NavLink>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav
          aria-label="Portal"
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2"
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <Icon size={16} />
              {label}
              {to === "/portal/notices" && (unread.data ?? 0) > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                  {unread.data}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}

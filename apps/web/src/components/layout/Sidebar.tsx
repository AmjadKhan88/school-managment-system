import { ChevronDown, GraduationCap, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ICONS } from "@/config/icons";
import { NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { useLogout } from "@/hooks/useLogout";

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, can } = useAuth();
  const logout = useLogout();
  const { pathname } = useLocation();

  const sections = useMemo(
    () =>
      NAVIGATION.map((s) => ({
        ...s,
        items: s.items.filter(
          (i) => i.action === "logout" || can(i.module, "VIEW"),
        ),
      })).filter((s) => s.items.length > 0),
    [can, user],
  );

  const activeSectionId = sections.find((s) =>
    s.items.some((i) => pathname.startsWith(i.path)),
  )?.id;

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(["main", activeSectionId ?? "main"]),
  );

  useEffect(() => {
    if (activeSectionId) setExpanded((p) => new Set(p).add(activeSectionId));
  }, [activeSectionId]);

  const toggle = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col bg-white text-slate-800 border-r border-slate-100 shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        {/* Header with Logo and Collapse Toggle */}
        <div className="flex items-center justify-between px-6 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-tr bg-brand-600 bg-brand-800 bg-brand-300 text-white shadow-md shadow-rose-500/20">
              {user?.school.logoUrl ? (
                <img
                  src={user.school.logoUrl}
                  alt=""
                  className="h-8 w-8 rounded-xl object-contain"
                />
              ) : (
                <GraduationCap size={22} />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-tight text-slate-900">
                {user?.school.name ?? "LOGO"}
              </p>
              <p className="text-[11px] font-medium tracking-wider text-brand-600 uppercase">
                School Slogan
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-md shadow-rose-500/20 transition-transform hover:scale-105 active:scale-95 lg:hidden"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="nav-scroll mt-2 flex-1 overflow-y-auto px-4 pb-6 space-y-5">
          {sections.map((section) => {
            const isOpen = expanded.has(section.id);
            const collapsible = section.id !== "main";
            return (
              <div key={section.id} className="space-y-1.5">
                {collapsible ? (
                  <button
                    onClick={() => toggle(section.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-950   hover:text-slate-900 transition-colors"
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform text-slate-700",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                ) : (
                  <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    {section.title}
                  </p>
                )}

                {isOpen && (
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = ICONS[item.icon];
                      const base =
                        "group relative flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-[14px] font-medium transition-all duration-200";

                      if (item.action === "logout")
                        return (
                          <li key={item.label}>
                            <button
                              onClick={logout}
                              className={cn(
                                base,
                                "text-rose-500 hover:bg-rose-50 hover:text-rose-600",
                              )}
                            >
                              <Icon size={20} className="shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          </li>
                        );

                      return (
                        <li key={item.path}>
                          <NavLink
                            to={item.path}
                            onClick={onClose}
                            className={({ isActive }) =>
                              cn(
                                base,
                                isActive
                                  ? " bg-brand-600 text-white shadow-lg shadow-rose-500/25 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                              )
                            }
                          >
                            <Icon size={20} className="shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Card */}
        <div className="mx-5 mb-2 flex items-center gap-3 rounded-2xl bg-slate-50/80 border border-slate-100 p-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr bg-brand-600 bg-brand-800 bg-brand-300 text-xs font-bold text-white shadow-sm">
            {user?.fullName?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">
              {user?.fullName}
            </p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="capitalize text-brand-600">
                {user?.roles[0]?.name ?? "User"}
              </span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "@/lib/api";
import type { AuthUser } from "@/types/auth";

export { fmtMoney } from "@/features/fees/shared";

/** A login that only has the Student or Parent role. These users see the portal, never the staff menu. */
export const isPortalUser = (u: AuthUser | null | undefined) =>
  !!u &&
  u.roles.length > 0 &&
  u.roles.every((r) => r.slug === "student" || r.slug === "parent");

export interface PortalChild {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  photoUrl: string | null;
  enrollment: null | {
    id: string;
    sessionId: string;
    classId: string;
    sectionId: string;
    rollNo: number | null;
    className: string;
    sectionName: string;
  };
}

export const useChildren = () =>
  useQuery({
    queryKey: ["portal", "children"],
    queryFn: async () =>
      (await api.get<{ data: PortalChild[] }>("/portal/children")).data.data,
  });

interface PortalState {
  studentId: string;
  setStudentId: (id: string) => void;
}
export const usePortalStore = create<PortalState>((set) => ({
  studentId: "",
  setStudentId: (studentId) => set({ studentId }),
}));

/** The child being viewed: the chosen one, else the first. Pages wait for `child` before querying. */
export function useChild() {
  const q = useChildren();
  const chosen = usePortalStore((s) => s.studentId);
  const child = q.data?.find((c) => c.id === chosen) ?? q.data?.[0] ?? null;
  return {
    child,
    loading: q.isLoading,
    error: q.error,
    count: q.data?.length ?? 0,
  };
}

export const ATT_STYLE: Record<string, [string, string]> = {
  PRESENT: ["Present", "bg-emerald-100 text-emerald-700"],
  ABSENT: ["Absent", "bg-rose-100 text-rose-700"],
  LATE: ["Late", "bg-amber-100 text-amber-700"],
  LEAVE: ["Leave", "bg-sky-100 text-sky-700"],
  HALF_DAY: ["Half day", "bg-violet-100 text-violet-700"],
};

export const LEAVE_STATUS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-200 text-slate-600",
};

export const METHOD: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "EasyPaisa",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

/** "2026-11" to "Nov 2026" */
export const period = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
};

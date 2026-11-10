import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type EnquiryStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "ADMISSION_PENDING"
  | "ADMITTED"
  | "REJECTED";

export const STATUS_LABEL: Record<EnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  ADMISSION_PENDING: "Admission Pending",
  ADMITTED: "Admitted",
  REJECTED: "Rejected",
};

export const STATUS_STYLE: Record<EnquiryStatus, string> = {
  NEW: "bg-sky-100 text-sky-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  INTERESTED: "bg-amber-100 text-amber-700",
  ADMISSION_PENDING: "bg-orange-100 text-orange-700",
  ADMITTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export interface ClassOption {
  id: string;
  name: string;
  level: number;
}

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString() : "—";
export const isoDate = (d?: string | null) => (d ? d.slice(0, 10) : "");
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Removes blank-string entries so the API treats them as "not provided". */
export const clean = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined),
  ) as Partial<T>;

export function useDebounced<T>(value: T, ms = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useClasses() {
  return useQuery({
    queryKey: ["/academics/classes"],
    queryFn: async () =>
      (await api.get<{ data: ClassOption[] }>("/academics/classes")).data.data,
  });
}

export function Field({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-semibold ${className}`}>
      {label}
      {children}
      {error && (
        <span className="mt-1 block text-xs font-normal text-rose-600">
          {error}
        </span>
      )}
    </label>
  );
}

export const StatusBadge = ({ status }: { status: EnquiryStatus }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
  >
    {STATUS_LABEL[status]}
  </span>
);

export type StudentStatus = "ACTIVE" | "PASSED_OUT" | "TRANSFERRED" | "LEFT";

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  PASSED_OUT: "Passed out",
  TRANSFERRED: "Transferred",
  LEFT: "Left",
};
const STUDENT_STATUS_STYLE: Record<StudentStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PASSED_OUT: "bg-sky-100 text-sky-700",
  TRANSFERRED: "bg-amber-100 text-amber-700",
  LEFT: "bg-slate-200 text-slate-600",
};

export const StudentStatusBadge = ({ status }: { status: StudentStatus }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STUDENT_STATUS_STYLE[status]}`}
  >
    {STUDENT_STATUS_LABEL[status]}
  </span>
);

export const Avatar = ({
  name,
  size = 36,
}: {
  name: string;
  size?: number;
}) => (
  <span
    className="grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700"
    style={{ width: size, height: size, fontSize: size * 0.38 }}
  >
    {name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("")}
  </span>
);

export function calcAge(dob?: string | null) {
  if (!dob) return null;
  const b = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  )
    age--;
  return age;
}

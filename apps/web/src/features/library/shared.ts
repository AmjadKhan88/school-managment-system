import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export { money } from "@/features/payroll/shared";

export const COPY_STYLE: Record<string, [string, string]> = {
  AVAILABLE: ["On shelf", "bg-emerald-100 text-emerald-700"],
  ISSUED: ["Issued", "bg-sky-100 text-sky-700"],
  LOST: ["Lost", "bg-rose-100 text-rose-700"],
  WITHDRAWN: ["Withdrawn", "bg-slate-200 text-slate-600"],
};
export const FINE_STYLE: Record<string, string> = {
  UNPAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  WAIVED: "bg-slate-200 text-slate-600",
};
export const REASON_LABEL: Record<string, string> = {
  OVERDUE: "Overdue",
  LOST: "Lost book",
  DAMAGED: "Damaged",
};

/** A WhatsApp chat link. Pakistani numbers starting with 0 become 92. */
export function waLink(phone: string | null | undefined, text: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return digits.length >= 10
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : null;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}
export const useCategories = () =>
  useQuery({
    queryKey: ["library", "categories"],
    queryFn: async () =>
      (await api.get<{ data: Category[] }>("/library/categories")).data.data,
  });

export interface LibrarySettings {
  finePerDay: number;
  loanDaysStudent: number;
  loanDaysEmployee: number;
  maxBooksStudent: number;
  maxBooksEmployee: number;
  maxRenewals: number;
}
export const useLibrarySettings = () =>
  useQuery({
    queryKey: ["library", "settings"],
    queryFn: async () =>
      (await api.get<{ data: LibrarySettings }>("/library/settings")).data.data,
  });

export interface IssueItem {
  id: string;
  issueNo: string;
  status: "ISSUED" | "RETURNED" | "LOST";
  issuedOn: string;
  dueDate: string;
  returnedOn: string | null;
  renewals: number;
  returnNote: string | null;
  book: { id: string; title: string; author: string };
  accessionNo: string;
  borrowerType: "STUDENT" | "EMPLOYEE";
  borrower: { id: string; name: string; detail: string };
  daysLate: number;
  fineSoFar: string | null;
}

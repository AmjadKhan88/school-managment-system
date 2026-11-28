import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const KIND_LABEL: Record<string, string> = {
  NOTICE: "Notice",
  CIRCULAR: "Circular",
  ANNOUNCEMENT: "Announcement",
};
export const KIND_STYLE: Record<string, string> = {
  NOTICE: "bg-sky-100 text-sky-700",
  CIRCULAR: "bg-violet-100 text-violet-700",
  ANNOUNCEMENT: "bg-amber-100 text-amber-700",
};
export const AUDIENCE_LABEL: Record<string, string> = {
  ALL: "Everyone",
  PARENTS: "Parents",
  STUDENTS: "Students",
  STAFF: "Staff",
  CLASS: "Chosen classes",
};
export const STATUS_STYLE: Record<string, [string, string]> = {
  DRAFT: ["Draft", "bg-slate-200 text-slate-600"],
  PUBLISHED: ["Published", "bg-emerald-100 text-emerald-700"],
  ARCHIVED: ["Archived", "bg-amber-100 text-amber-700"],
};

export interface ClassOption {
  id: string;
  name: string;
}
export const useNoticeClasses = () =>
  useQuery({
    queryKey: ["communication", "classes"],
    queryFn: async () =>
      (await api.get<{ data: ClassOption[] }>("/communication/classes")).data
        .data,
  });

/** Unread count for the logged-in person's notice inbox. Refreshes every minute. */
export const useUnreadNotices = () =>
  useQuery({
    queryKey: ["notices", "unread"],
    refetchInterval: 60_000,
    queryFn: async () =>
      (await api.get<{ data: { count: number } }>("/notices/unread-count")).data
        .data.count,
  });

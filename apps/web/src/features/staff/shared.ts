import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type EmpStatus = "ACTIVE" | "RESIGNED" | "TERMINATED" | "RETIRED";
export const STATUS_LABEL: Record<EmpStatus, string> = {
  ACTIVE: "Active",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
  RETIRED: "Retired",
};
export const STATUS_STYLE: Record<EmpStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  RESIGNED: "bg-slate-200 text-slate-600",
  TERMINATED: "bg-rose-100 text-rose-700",
  RETIRED: "bg-sky-100 text-sky-700",
};
export const TYPE_LABEL: Record<string, string> = {
  PERMANENT: "Permanent",
  CONTRACT: "Contract",
  PART_TIME: "Part-time",
  VISITING: "Visiting",
};
export const ROLE_OPTIONS: [string, string][] = [
  ["teacher", "Teacher"],
  ["class-teacher", "Class Teacher"],
  ["vice-principal", "Vice Principal"],
  ["principal", "Principal"],
  ["accountant", "Accountant"],
  ["admission-officer", "Admission Officer"],
  ["attendance-operator", "Attendance Operator"],
  ["librarian", "Librarian"],
  ["transport-manager", "Transport Manager"],
  ["hr-manager", "HR Manager"],
];

export interface Lookup {
  id: string;
  name: string;
  isActive: boolean;
  isTeaching?: boolean;
}
export const useDesignations = () =>
  useQuery({
    queryKey: ["staff", "designations"],
    queryFn: async () =>
      (await api.get<{ data: Lookup[] }>("/staff/designations")).data.data,
  });
export const useDepartments = () =>
  useQuery({
    queryKey: ["staff", "departments"],
    queryFn: async () =>
      (await api.get<{ data: Lookup[] }>("/staff/departments")).data.data,
  });

export interface Teacher {
  id: string;
  employeeNo: string;
  fullName: string;
}
export const useTeachers = () =>
  useQuery({
    queryKey: ["staff", "teachers"],
    queryFn: async () =>
      (await api.get<{ data: Teacher[] }>("/staff/teachers")).data.data,
  });

export interface MyScope {
  restricted: boolean;
  classTeacher: { classId: string; sectionId: string }[];
  teaching: { classId: string; sectionId: string; subjectId: string }[];
}
/** What the signed-in user is limited to. Used to narrow dropdowns; the server enforces the limit anyway. */
export const useMyScope = (sessionId: string) =>
  useQuery({
    queryKey: ["staff", "my-scope", sessionId],
    enabled: !!sessionId,
    queryFn: async () =>
      (
        await api.get<{ data: MyScope }>("/staff/my-scope", {
          params: { sessionId },
        })
      ).data.data,
  });

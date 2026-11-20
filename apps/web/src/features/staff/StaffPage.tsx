import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { emptyEmployee, EmployeeForm } from "./EmployeeForm";
import {
  EmpStatus,
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
  useDepartments,
  useDesignations,
} from "./shared";

interface Row {
  id: string;
  employeeNo: string;
  fullName: string;
  phone: string;
  designation: string;
  department: string | null;
  employmentType: string;
  status: EmpStatus;
  isTeacher: boolean;
  joiningDate: string;
  hasAccount: boolean;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}

export default function StaffPage({
  teachersOnly = false,
}: {
  teachersOnly?: boolean;
}) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [designationId, setDesignationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dq = useDebounced(q);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const designations = useDesignations();
  const departments = useDepartments();
  const filters = {
    q: dq || undefined,
    status: status || undefined,
    designationId: designationId || undefined,
    departmentId: departmentId || undefined,
    isTeacher: teachersOnly ? "true" : undefined,
  };
  const params = { ...filters, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ["staff", "employees", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/staff/employees", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile("/staff/employees/export", filters, "staff.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={teachersOnly ? "Teacher Management" : "Staff Management"}
        subtitle={
          teachersOnly
            ? "Teaching staff. Assign them to classes and subjects under Academic Management."
            : "All employees: teachers and support staff."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can("staff", "EXPORT") && (
              <button
                className="btn border border-slate-300"
                onClick={exportXlsx}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={16} />
                )}
                Export Excel
              </button>
            )}
            {can("staff", "CREATE") && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} />
                Add {teachersOnly ? "teacher" : "employee"}
              </button>
            )}
          </div>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Name, number, phone or CNIC"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as EmpStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={designationId}
          onChange={(e) => reset(setDesignationId)(e.target.value)}
          aria-label="Designation"
        >
          <option value="">All designations</option>
          {designations.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={departmentId}
          onChange={(e) => reset(setDepartmentId)(e.target.value)}
          aria-label="Department"
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Employee no",
                "Name",
                "Designation",
                "Department",
                "Phone",
                "Type",
                "Joined",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {list.isError && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load staff")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No employees match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.employeeNo}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/staff/view/${r.id}`}
                    className="font-semibold hover:text-brand-700"
                  >
                    {r.fullName}
                  </Link>
                  {r.isTeacher && (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      Teacher
                    </span>
                  )}
                  {r.hasAccount && (
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      Login
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{r.designation}</td>
                <td className="px-4 py-3">{r.department ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{r.phone}</td>
                <td className="px-4 py-3">{TYPE_LABEL[r.employmentType]}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.joiningDate)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2">
                Page {page} of {pages}
              </span>
              <button
                className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {adding && (
        <EmployeeForm
          initial={emptyEmployee(teachersOnly)}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["staff"] });
          }}
        />
      )}
    </>
  );
}

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, useDebounced } from "@/features/students/shared";
import { useDepartments } from "@/features/staff/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { money } from "./shared";

interface Row {
  id: string;
  employeeNo: string;
  fullName: string;
  designation: string;
  status: string;
  basicSalary: string | null;
  allowances: string;
  deductions: string;
  gross: string;
  estimatedNet: string;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface Comp {
  id: string;
  name: string;
  type: "ALLOWANCE" | "DEDUCTION";
  isPercent: boolean;
}
interface Structure {
  employee: {
    id: string;
    employeeNo: string;
    fullName: string;
    designation: string;
  };
  basicSalary: string | null;
  items: { componentId: string; value: string }[];
  components: Comp[];
}

export default function SalaryManagementPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [all, setAll] = useState(false);
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<string | null>(null);
  const dq = useDebounced(q);
  const departments = useDepartments();

  const params = {
    q: dq || undefined,
    departmentId: departmentId || undefined,
    status: all ? "ALL" : "ACTIVE",
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["payroll", "structure", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/payroll/structure", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Salary Management"
        subtitle="Each employee's basic salary, allowances and deductions. Net shown here is before attendance, bonuses, overtime and loans."
      />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Name or employee number"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setPage(1);
          }}
          aria-label="Department"
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
              setPage(1);
            }}
          />
          Include former staff
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Employee",
                "Designation",
                "Basic",
                "Allowances",
                "Deductions",
                "Gross",
                "Net (before attendance)",
              ].map((h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap px-4 py-3 ${i > 1 ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
              <th />
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
                  {apiMessage(list.error, "Could not load salaries")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No employees match.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  {r.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.employeeNo}
                  </span>
                </td>
                <td className="px-4 py-3">{r.designation}</td>
                <td className="px-4 py-3 text-right">
                  {r.basicSalary ? (
                    money(r.basicSalary)
                  ) : (
                    <span className="text-amber-600">Not set</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{money(r.allowances)}</td>
                <td className="px-4 py-3 text-right">{money(r.deductions)}</td>
                <td className="px-4 py-3 text-right">{money(r.gross)}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {money(r.estimatedNet)}
                </td>
                <td className="px-4 py-2 text-right">
                  {can("payroll", "EDIT") && (
                    <button
                      className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                      onClick={() => setEditId(r.id)}
                      aria-label={`Edit salary of ${r.fullName}`}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
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

      {editId && (
        <StructureDialog
          id={editId}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            qc.invalidateQueries({ queryKey: ["payroll"] });
            qc.invalidateQueries({ queryKey: ["staff"] });
          }}
        />
      )}
    </>
  );
}

function StructureDialog({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const q = useQuery({
    queryKey: ["payroll", "structure", "one", id],
    queryFn: async () =>
      (await api.get<{ data: Structure }>(`/payroll/structure/${id}`)).data
        .data,
  });
  const [basic, setBasic] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const d = q.data;

  const basicValue = basic ?? d?.basicSalary ?? "";
  const vals =
    values ??
    Object.fromEntries((d?.items ?? []).map((i) => [i.componentId, i.value]));
  const b = Number(basicValue) || 0;
  const amountOf = (c: Comp) => {
    const v = Number(vals[c.id]);
    return !vals[c.id] || isNaN(v)
      ? 0
      : c.isPercent
        ? Math.round(b * v) / 100
        : v;
  };
  const allowances = (d?.components ?? [])
    .filter((c) => c.type === "ALLOWANCE")
    .reduce((t, c) => t + amountOf(c), 0);
  const deductions = (d?.components ?? [])
    .filter((c) => c.type === "DEDUCTION")
    .reduce((t, c) => t + amountOf(c), 0);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/payroll/structure/${id}`, {
        basicSalary: Number(basicValue),
        items: (d?.components ?? [])
          .filter((c) => vals[c.id] !== undefined && vals[c.id] !== "")
          .map((c) => ({ componentId: c.id, value: Number(vals[c.id]) })),
      }),
    onSuccess: () => {
      toast.success(
        "Salary saved. Recalculate any draft payroll to pick it up.",
      );
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const invalid =
    !(b > 0) ||
    (d?.components ?? []).some((c) => c.isPercent && Number(vals[c.id]) > 100);

  const group = (type: "ALLOWANCE" | "DEDUCTION", title: string) => {
    const list = (d?.components ?? []).filter((c) => c.type === type);
    if (list.length === 0) return null;
    return (
      <div className="mt-4">
        <h3 className="text-sm font-bold text-ink-950">{title}</h3>
        <div className="mt-2 space-y-2">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              <span className="w-44 font-semibold">{c.name}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input w-32 py-1.5"
                placeholder={c.isPercent ? "% of basic" : "Amount"}
                value={vals[c.id] ?? ""}
                onChange={(e) => setValues({ ...vals, [c.id]: e.target.value })}
                aria-label={c.name}
              />
              <span className="text-xs text-slate-500">
                {c.isPercent ? `% = ${money(amountOf(c))}` : "fixed"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-lg p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Salary structure</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {q.isLoading && (
          <Loader2 className="mx-auto my-10 animate-spin text-slate-400" />
        )}
        {q.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(q.error, "Could not load")}
          </p>
        )}
        {d && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {d.employee.fullName} · {d.employee.employeeNo} ·{" "}
              {d.employee.designation}
            </p>
            <Field label="Basic salary (monthly) *" className="mt-4">
              <input
                required
                type="number"
                min="1"
                step="0.01"
                className="input mt-1.5 font-normal"
                value={basicValue}
                onChange={(e) => setBasic(e.target.value)}
              />
            </Field>
            {group("ALLOWANCE", "Allowances")}
            {group("DEDUCTION", "Deductions")}
            {d.components.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                No components yet. Add some under Salary Structure.
              </p>
            )}
            <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-center text-sm">
              <div>
                <dt className="text-xs text-slate-500">Gross</dt>
                <dd className="font-bold">{money(b + allowances)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Deductions</dt>
                <dd className="font-bold">{money(deductions)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  Net (before attendance)
                </dt>
                <dd className="font-bold text-emerald-700">
                  {money(b + allowances - deductions)}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={invalid || save.isPending}
              >
                {save.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Save
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

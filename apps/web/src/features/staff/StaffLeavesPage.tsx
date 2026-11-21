import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";

type LStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
const STATUS_STYLE: Record<LStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};
const STATUS_LABEL: Record<LStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
const TYPE_LABEL: Record<string, string> = {
  SICK: "Sick leave",
  CASUAL: "Casual leave",
  ANNUAL: "Annual leave",
  EMERGENCY: "Emergency",
  FAMILY: "Family event",
  MATERNITY: "Maternity leave",
  UNPAID: "Unpaid leave",
  OTHER: "Other",
};

interface Row {
  id: string;
  applicationNo: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LStatus;
  hasDocument: boolean;
  rejectionReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  employee: {
    id: string;
    employeeNo: string;
    fullName: string;
    designation: string;
  } | null;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  pending: number;
}
interface Detail extends Row {
  decidedAt: string | null;
  submittedBy: string | null;
  decidedBy: string | null;
  document: { name: string | null } | null;
}
interface Me {
  employee: { id: string; employeeNo: string; fullName: string } | null;
  canApplyForOthers: boolean;
  canDecide: boolean;
}
interface Found {
  id: string;
  employeeNo: string;
  fullName: string;
  designation: { name: string };
}

const range = (r: { startDate: string; endDate: string }) =>
  r.startDate.slice(0, 10) === r.endDate.slice(0, 10)
    ? fmtDate(r.startDate)
    : `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}`;

async function openDocument(id: string) {
  try {
    const res = await api.get<Blob>(`/staff-leaves/${id}/document`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    toast.error("Could not open the document");
  }
}

export default function StaffLeavesPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const dq = useDebounced(q);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const me = useQuery({
    queryKey: ["staff-leaves", "me"],
    queryFn: async () =>
      (await api.get<{ data: Me }>("/staff-leaves/me")).data.data,
  });
  const seeAll = can("staff", "VIEW");
  const filters = {
    q: seeAll ? dq || undefined : undefined,
    status: status || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const params = { ...filters, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ["staff-leaves", "list", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/staff-leaves", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["staff-leaves"] });
    qc.invalidateQueries({ queryKey: ["staff-attendance"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const decide = useMutation({
    mutationFn: (v: {
      id: string;
      action: "approve" | "reject";
      reason?: string;
    }) =>
      api.post(
        `/staff-leaves/${v.id}/${v.action}`,
        v.reason ? { reason: v.reason } : undefined,
      ),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "approve" ? "Leave approved" : "Leave rejected",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const reject = (id: string) => {
    const reason = window.prompt("Remarks for rejecting this leave:");
    if (reason && reason.trim().length >= 3)
      decide.mutate({ id, action: "reject", reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give remarks of at least 3 characters");
  };
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile("/staff-leaves/export", filters, "staff-leave.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const mine = me.data?.employee?.id;

  return (
    <>
      <PageHeader
        title="Leave Management"
        subtitle={
          seeAll
            ? "Staff and teacher leave. Approved leave pre-fills the staff attendance register."
            : "Your leave applications."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {seeAll && can("leaves", "EXPORT") && (
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
            {can("leaves", "CREATE") && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} />
                New application
              </button>
            )}
          </div>
        }
      />

      {data && data.pending > 0 && me.data?.canDecide && (
        <button
          onClick={() => {
            setStatus("PENDING");
            setPage(1);
          }}
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          {data.pending} application{data.pending === 1 ? "" : "s"} waiting for
          a decision
        </button>
      )}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {seeAll && (
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-9"
              placeholder="Employee name or number"
              value={q}
              onChange={(e) => reset(setQ)(e.target.value)}
            />
          </div>
        )}
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as LStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={type}
          onChange={(e) => reset(setType)(e.target.value)}
          aria-label="Leave type"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="Leave from"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <input
          type="date"
          className="input"
          aria-label="Leave to"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Application",
                "Employee",
                "Type",
                "Dates",
                "Reason",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
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
                  colSpan={7}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load leave applications")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No leave applications match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.applicationNo}
                </td>
                <td className="px-4 py-3">
                  {r.employee?.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.employee?.employeeNo} · {r.employee?.designation}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {TYPE_LABEL[r.leaveType]}
                  {r.leaveType === "UNPAID" && (
                    <span className="ml-1 text-xs text-rose-600">(unpaid)</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {range(r)}
                  <span className="block text-xs text-slate-500">
                    {r.days} day{r.days === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="max-w-xs px-4 py-3">
                  <span className="line-clamp-2">{r.reason}</span>
                  {r.hasDocument && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-slate-500">
                      <Paperclip size={12} />
                      Document
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <span className="block text-xs text-rose-600">
                      {r.rejectionReason}
                    </span>
                  )}
                </td>
                <td
                  className="px-4 py-2 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.status === "PENDING" &&
                    me.data?.canDecide &&
                    r.employee?.id !== mine && (
                      <div className="inline-flex gap-1">
                        <button
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, action: "approve" })
                          }
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={() => reject(r.id)}
                        >
                          Reject
                        </button>
                      </div>
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

      {adding && me.data && (
        <NewLeave
          me={me.data}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {openId && me.data && (
        <LeaveDetail
          id={openId}
          me={me.data}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function NewLeave({
  me,
  onClose,
  onSaved,
}: {
  me: Me;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const ds = useDebounced(search.trim());
  const [other, setOther] = useState<Found | null>(null);
  const [f, setF] = useState({
    leaveType: "CASUAL",
    startDate: localToday(),
    endDate: localToday(),
    reason: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const found = useQuery({
    queryKey: ["staff-leaves", "employee-search", ds],
    enabled: me.canApplyForOthers && ds.length >= 2 && !other,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/staff-leaves/employee-search", {
          params: { q: ds },
        })
      ).data.data,
  });
  const set =
    (k: keyof typeof f) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));
  const days =
    Math.round(
      (new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) /
        86_400_000,
    ) + 1;
  const self = me.employee;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!other && !self) {
      toast.error("Choose the employee this leave is for");
      return;
    }
    if (f.endDate < f.startDate) {
      toast.error("The end date is before the start date");
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      toast.error("The document is larger than 5 MB");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      if (other) body.append("employeeId", other.id);
      Object.entries(f).forEach(([k, v]) => body.append(k, v));
      if (file) body.append("document", file);
      const res = await api.post<{ data: { applicationNo: string } }>(
        "/staff-leaves",
        body,
      );
      toast.success(
        `Leave application ${res.data.data.applicationNo} recorded`,
      );
      onSaved();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={submit} className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">New leave application</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          {!me.canApplyForOthers ? (
            self ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm">
                For <strong>{self.fullName}</strong> ({self.employeeNo})
              </p>
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Your login is not linked to an employee record, so you cannot
                apply for leave here. Ask HR to link it.
              </p>
            )
          ) : other ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <span>
                <strong>{other.fullName}</strong> · {other.employeeNo} ·{" "}
                {other.designation.name}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => setOther(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              {self && (
                <p className="mb-2 rounded-lg bg-slate-50 p-3 text-sm">
                  Applying for yourself ({self.fullName}). To apply for someone
                  else, search below.
                </p>
              )}
              <Field label="Apply for another employee">
                <input
                  className="input mt-1.5 font-normal"
                  placeholder="Name or employee number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <ul className="mt-2 space-y-1">
                {found.data?.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => setOther(s)}
                    >
                      <span className="font-semibold">{s.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {s.employeeNo} · {s.designation.name}
                      </span>
                    </button>
                  </li>
                ))}
                {found.data?.length === 0 && (
                  <li className="px-1 text-sm text-slate-500">
                    No active employee found.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Leave type *">
            <select
              className="input mt-1.5 font-normal"
              value={f.leaveType}
              onChange={set("leaveType")}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="self-end pb-2 text-sm text-slate-600">
            {days > 0 ? `${days} day${days === 1 ? "" : "s"}` : ""}
          </div>
          <Field label="From *">
            <input
              required
              type="date"
              className="input mt-1.5 font-normal"
              value={f.startDate}
              onChange={set("startDate")}
            />
          </Field>
          <Field label="To *">
            <input
              required
              type="date"
              min={f.startDate}
              className="input mt-1.5 font-normal"
              value={f.endDate}
              onChange={set("endDate")}
            />
          </Field>
          <Field label="Reason *" className="sm:col-span-2">
            <textarea
              required
              minLength={5}
              rows={3}
              className="input mt-1.5 font-normal"
              value={f.reason}
              onChange={set("reason")}
            />
          </Field>
        </div>
        {f.leaveType === "UNPAID" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Unpaid leave will be deducted from salary when payroll is run.
          </p>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-bold text-ink-950">
            Supporting document (optional)
          </h3>
          {file ? (
            <p className="mt-1 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{file.name}</span>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800"
                aria-label="Remove file"
                onClick={() => setFile(null)}
              >
                <X size={14} />
              </button>
            </p>
          ) : (
            <label className="btn mt-1 cursor-pointer border border-slate-300 py-1.5">
              <Paperclip size={15} />
              Attach document
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <p className="mt-1 text-xs text-slate-500">
            A medical certificate or note. PDF, JPG, PNG or WebP up to 5 MB.
          </p>
        </div>

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
            disabled={saving || (!other && !self)}
          >
            {saving && <Loader2 size={15} className="animate-spin" />}Submit
            application
          </button>
        </div>
      </form>
    </div>
  );
}

function LeaveDetail({
  id,
  me,
  onClose,
  onChanged,
}: {
  id: string;
  me: Me;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["staff-leaves", "one", id],
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/staff-leaves/${id}`)).data.data,
  });
  const d = q.data;
  const own = !!d && d.employee?.id === me.employee?.id;

  const act = useMutation({
    mutationFn: (v: {
      action: "approve" | "reject" | "cancel";
      reason?: string;
    }) =>
      api.post(
        `/staff-leaves/${id}/${v.action}`,
        v.reason ? { reason: v.reason } : undefined,
      ),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "approve"
          ? "Leave approved"
          : v.action === "reject"
            ? "Leave rejected"
            : "Leave cancelled",
      );
      onChanged();
      qc.invalidateQueries({ queryKey: ["staff-leaves", "one", id] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const withReason = (action: "reject" | "cancel", prompt: string) => {
    const reason = window.prompt(prompt);
    if (reason && reason.trim().length >= 3)
      act.mutate({ action, reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };
  const replaceDoc = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("The document is larger than 5 MB");
      return;
    }
    const body = new FormData();
    body.append("document", file);
    try {
      await api.post(`/staff-leaves/${id}/document`, body);
      toast.success("Document saved");
      qc.invalidateQueries({ queryKey: ["staff-leaves"] });
    } catch (e) {
      toast.error(apiMessage(e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {d?.applicationNo ?? "Leave application"}
          </h2>
          <button
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
            {apiMessage(q.error, "Could not load the application")}
          </p>
        )}
        {d && (
          <>
            <div className="mt-3 flex items-center justify-between">
              <p className="font-bold">
                {d.employee?.fullName}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {d.employee?.employeeNo} · {d.employee?.designation}
                </span>
              </p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[d.status]}`}
              >
                {STATUS_LABEL[d.status]}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold text-slate-500">Type</dt>
                <dd>{TYPE_LABEL[d.leaveType]}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Dates</dt>
                <dd>
                  {range(d)} ({d.days} day{d.days === 1 ? "" : "s"})
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-semibold text-slate-500">Reason</dt>
                <dd className="whitespace-pre-wrap">{d.reason}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">
                  Entered by
                </dt>
                <dd>{d.submittedBy ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">
                  Entered on
                </dt>
                <dd>{fmtDate(d.createdAt)}</dd>
              </div>
              {d.decidedBy && (
                <div>
                  <dt className="text-xs font-semibold text-slate-500">
                    Decided by
                  </dt>
                  <dd>
                    {d.decidedBy}
                    {d.decidedAt ? ` · ${fmtDate(d.decidedAt)}` : ""}
                  </dd>
                </div>
              )}
              {d.rejectionReason && (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold text-rose-600">
                    Rejection remarks
                  </dt>
                  <dd>{d.rejectionReason}</dd>
                </div>
              )}
              {d.cancelReason && (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold text-slate-500">
                    Cancelled because
                  </dt>
                  <dd>{d.cancelReason}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4">
              <h3 className="text-sm font-bold text-ink-950">
                Supporting document
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                {d.document ? (
                  <button
                    className="flex items-center gap-2 font-semibold text-brand-700 hover:underline"
                    onClick={() => openDocument(id)}
                  >
                    <Paperclip size={14} />
                    {d.document.name}
                  </button>
                ) : (
                  <span className="text-slate-500">None attached.</span>
                )}
                {d.status === "PENDING" && (
                  <label className="btn cursor-pointer border border-slate-300 py-1">
                    <span>{d.document ? "Replace" : "Attach"}</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) replaceDoc(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            {d.status === "PENDING" && own && me.canDecide && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                This is your own leave. Another approver must decide it.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {d.status === "PENDING" && me.canDecide && !own && (
                <>
                  <button
                    className="btn border border-rose-300 text-rose-600"
                    onClick={() =>
                      withReason("reject", "Remarks for rejecting this leave:")
                    }
                    disabled={act.isPending}
                  >
                    Reject
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => act.mutate({ action: "approve" })}
                    disabled={act.isPending}
                  >
                    {act.isPending && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                    Approve
                  </button>
                </>
              )}
              {(d.status === "PENDING" ||
                (d.status === "APPROVED" && me.canDecide)) && (
                <button
                  className="btn border border-slate-300"
                  onClick={() =>
                    withReason(
                      "cancel",
                      "Why is this application being cancelled?",
                    )
                  }
                  disabled={act.isPending}
                >
                  Cancel application
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { fmtMoney } from "./shared";

type Kind = "DISCOUNT" | "SCHOLARSHIP";
type DStatus = "PENDING" | "APPROVED" | "REVOKED";
const STATUS_STYLE: Record<DStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REVOKED: "bg-slate-200 text-slate-500",
};

interface Row {
  id: string;
  kind: Kind;
  mode: "PERCENT" | "FIXED";
  value: string;
  categoryName: string | null;
  validFromPeriod: string | null;
  validToPeriod: string | null;
  reason: string;
  status: DStatus;
  student: { admissionNo: string; fullName: string };
  className: string;
  section: string;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface Category {
  id: string;
  name: string;
  isActive: boolean;
}
interface Found {
  enrollmentId: string;
  student: { admissionNo: string; fullName: string };
  class: { name: string };
  section: { name: string };
}

export default function DiscountsPage({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { sessionId } = useAuth();
  const label = kind === "DISCOUNT" ? "Discount" : "Scholarship";

  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);

  const params = {
    sessionId: sessionId || undefined,
    kind,
    status: status || undefined,
    q: dq || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["fees", "discounts", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/discounts", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["fees", "discounts"] });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "revoke" }) =>
      api.post(`/fees/discounts/${v.id}/${v.action}`),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "approve" ? `${label} approved` : `${label} revoked`,
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const describe = (r: Row) =>
    (r.mode === "PERCENT" ? `${Number(r.value)}%` : fmtMoney(r.value)) +
    ` off ${r.categoryName ?? "all monthly fees"}`;

  return (
    <>
      <PageHeader
        title={kind === "DISCOUNT" ? "Fee Discounts" : "Scholarships"}
        subtitle={`Only approved ${label.toLowerCase()}s are applied when invoices are generated. Revoking stops future use; issued invoices are not changed.`}
        actions={
          can("discounts", "CREATE") && (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add {label.toLowerCase()}
            </button>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Student name or admission no"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REVOKED">Revoked</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">{label}</th>
              <th className="px-4 py-3">Months</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
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
                  {apiMessage(list.error, "Could not load the list")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No {label.toLowerCase()}s yet.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.className} / {r.section}
                </td>
                <td className="px-4 py-3 font-semibold">{describe(r)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.validFromPeriod || r.validToPeriod
                    ? `${r.validFromPeriod ?? "start"} to ${r.validToPeriod ?? "end"}`
                    : "Whole session"}
                </td>
                <td className="px-4 py-3">{r.reason}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {r.status === "PENDING" && can("discounts", "APPROVE") && (
                      <button
                        onClick={() =>
                          act.mutate({ id: r.id, action: "approve" })
                        }
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <Check size={14} />
                        Approve
                      </button>
                    )}
                    {r.status !== "REVOKED" && can("discounts", "DELETE") && (
                      <button
                        onClick={() =>
                          window.confirm(
                            `Revoke this ${label.toLowerCase()}?`,
                          ) && act.mutate({ id: r.id, action: "revoke" })
                        }
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
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
        <AddDialog
          kind={kind}
          label={label}
          sessionId={sessionId ?? ""}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

function AddDialog({
  kind,
  label,
  sessionId,
  onClose,
  onSaved,
}: {
  kind: Kind;
  label: string;
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const ds = useDebounced(search.trim());
  const [student, setStudent] = useState<Found | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [value, setValue] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  const found = useQuery({
    queryKey: ["fees", "discount-search", ds, sessionId],
    enabled: ds.length >= 2 && !!sessionId && !student,
    queryFn: async () =>
      (
        await api.get<{ data: { items: Found[] } }>("/fees/assignments", {
          params: { sessionId, q: ds, pageSize: 8 },
        })
      ).data.data.items,
  });
  const categories = useQuery({
    queryKey: ["fees", "categories"],
    queryFn: async () =>
      (await api.get<{ data: Category[] }>("/fees/categories")).data.data,
  });

  const save = useMutation({
    mutationFn: () =>
      api.post("/fees/discounts", {
        enrollmentId: student!.enrollmentId,
        kind,
        categoryId: categoryId || undefined,
        mode,
        value: Number(value),
        validFromPeriod: from || undefined,
        validToPeriod: to || undefined,
        reason,
      }),
    onSuccess: () => {
      toast.success(`${label} saved`);
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) {
      toast.error("Choose a student");
      return;
    }
    if (!(Number(value) > 0)) {
      toast.error("Enter a value above 0");
      return;
    }
    if (mode === "PERCENT" && Number(value) > 100) {
      toast.error("A percentage cannot exceed 100");
      return;
    }
    save.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={submit} className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Add {label.toLowerCase()}</h2>
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
          {student ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <span>
                <strong>{student.student.fullName}</strong> ·{" "}
                {student.student.admissionNo} · {student.class.name} /{" "}
                {student.section.name}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => setStudent(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Field label="Find student *">
                <input
                  className="input mt-1.5 font-normal"
                  placeholder="Name or admission number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </Field>
              <ul className="mt-2 space-y-1">
                {found.data?.map((f) => (
                  <li key={f.enrollmentId}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => setStudent(f)}
                    >
                      <span className="font-semibold">
                        {f.student.fullName}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {f.student.admissionNo} · {f.class.name} /{" "}
                        {f.section.name}
                      </span>
                    </button>
                  </li>
                ))}
                {found.data?.length === 0 && (
                  <li className="px-1 text-sm text-slate-500">
                    No enrolled student found.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Applies to" className="sm:col-span-2">
            <select
              className="input mt-1.5 font-normal"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All monthly fees</option>
              {categories.data
                ?.filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className="input mt-1.5 font-normal"
              value={mode}
              onChange={(e) => setMode(e.target.value as "PERCENT" | "FIXED")}
            >
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed amount per invoice</option>
            </select>
          </Field>
          <Field label={mode === "PERCENT" ? "Percent *" : "Amount *"}>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input mt-1.5 font-normal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Field label="From month (optional)">
            <input
              type="month"
              className="input mt-1.5 font-normal"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To month (optional)">
            <input
              type="month"
              className="input mt-1.5 font-normal"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Reason *" className="sm:col-span-2">
            <input
              required
              minLength={3}
              className="input mt-1.5 font-normal"
              placeholder={
                kind === "DISCOUNT"
                  ? "Sibling concession, staff child…"
                  : "Merit scholarship, need-based…"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

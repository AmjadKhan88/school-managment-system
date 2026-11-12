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
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { fmtMoney, METHOD_LABEL, Method, NEEDS_REFERENCE } from "./shared";

type RStatus = "PENDING" | "PAID" | "REJECTED";
const STATUS_STYLE: Record<RStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-200 text-slate-500",
};
const STATUS_LABEL: Record<RStatus, string> = {
  PENDING: "Awaiting approval",
  PAID: "Paid",
  REJECTED: "Rejected",
};

interface Row {
  id: string;
  refundNo: string;
  amount: string;
  method: Method;
  reference: string | null;
  reason: string;
  status: RStatus;
  rejectionReason: string | null;
  paidDate: string | null;
  createdAt: string;
  student: { admissionNo: string; fullName: string };
  requestedBy: string | null;
  decidedBy: string | null;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface Found {
  id: string;
  admissionNo: string;
  fullName: string;
  className: string | null;
  section: string | null;
}
interface Dues {
  creditBalance: string;
}

export default function RefundsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);

  const params = {
    q: dq || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["fees", "refunds", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/refunds", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fees"] });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/fees/refunds/${id}/approve`),
    onSuccess: () => {
      toast.success("Refund approved and paid");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/fees/refunds/${v.id}/reject`, { reason: v.reason }),
    onSuccess: () => {
      toast.success("Refund rejected");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const askReject = (id: string) => {
    const reason = window.prompt("Reason for rejecting this refund:");
    if (reason && reason.trim().length >= 3)
      reject.mutate({ id, reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Fee Refunds"
        subtitle="Return advance credit to a family. A request must be approved before money goes out."
        actions={
          can("refunds", "CREATE") && (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Request refund
            </button>
          )
        }
      />

      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        Refunds return <strong>advance credit</strong> (money paid ahead and not
        applied to any invoice). To give back money already applied to an
        invoice, open the receipt under Payment History and use{" "}
        <strong>Reverse payment</strong>, then collect the correct amount again.
      </div>

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
          <option value="PENDING">Awaiting approval</option>
          <option value="PAID">Paid</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Refund no",
                "Requested",
                "Student",
                "Amount",
                "Method",
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
                  {apiMessage(list.error, "Could not load refunds")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No refunds yet.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.refundNo}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.createdAt)}
                  <span className="block text-xs text-slate-500">
                    {r.requestedBy ?? ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {fmtMoney(r.amount)}
                </td>
                <td className="px-4 py-3">
                  {METHOD_LABEL[r.method]}
                  {r.reference ? (
                    <span className="block text-xs text-slate-500">
                      {r.reference}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {r.reason}
                  {r.status === "REJECTED" && r.rejectionReason ? (
                    <span className="block text-xs text-rose-600">
                      Rejected: {r.rejectionReason}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === "PAID" && r.paidDate && (
                    <span className="block text-xs text-slate-500">
                      {fmtDate(r.paidDate)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "PENDING" && can("refunds", "APPROVE") && (
                    <div className="inline-flex gap-1">
                      <button
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        disabled={approve.isPending}
                        onClick={() =>
                          window.confirm(
                            `Approve and pay ${fmtMoney(r.amount)} to ${r.student.fullName}?`,
                          ) && approve.mutate(r.id)
                        }
                      >
                        <Check size={14} />
                        Approve
                      </button>
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        onClick={() => askReject(r.id)}
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

      {adding && (
        <RequestDialog
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

function RequestDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const ds = useDebounced(search.trim());
  const [student, setStudent] = useState<Found | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const found = useQuery({
    queryKey: ["fees", "refund-search", ds],
    enabled: ds.length >= 2 && !student,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/fees/payments/search", {
          params: { q: ds },
        })
      ).data.data,
  });
  const dues = useQuery({
    queryKey: ["fees", "refund-credit", student?.id],
    enabled: !!student,
    queryFn: async () =>
      (
        await api.get<{ data: Dues }>(
          `/fees/payments/student/${student!.id}/dues`,
        )
      ).data.data,
  });
  const credit = Number(dues.data?.creditBalance ?? 0);

  const save = useMutation({
    mutationFn: () =>
      api.post("/fees/refunds", {
        studentId: student!.id,
        amount: Number(amount),
        method,
        reference: reference || undefined,
        reason,
      }),
    onSuccess: () => {
      toast.success("Refund requested");
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
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount above 0");
      return;
    }
    if (Number(amount) > credit) {
      toast.error(`The student has only ${fmtMoney(credit)} of advance credit`);
      return;
    }
    if (NEEDS_REFERENCE.includes(method) && !reference.trim()) {
      toast.error("Enter the reference for this method");
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
          <h2 className="text-lg font-bold">Request a refund</h2>
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
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  <strong>{student.fullName}</strong> · {student.admissionNo}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-700 hover:underline"
                  onClick={() => setStudent(null)}
                >
                  Change
                </button>
              </div>
              <p className="mt-1 text-slate-700">
                Advance credit available:{" "}
                <strong>{dues.isLoading ? "…" : fmtMoney(credit)}</strong>
              </p>
            </div>
          ) : (
            <>
              <Field label="Find student *">
                <input
                  className="input mt-1.5 font-normal"
                  autoFocus
                  placeholder="Name or admission number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <ul className="mt-2 space-y-1">
                {found.data?.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => setStudent(f)}
                    >
                      <span className="font-semibold">{f.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {f.admissionNo}
                      </span>
                    </button>
                  </li>
                ))}
                {found.data?.length === 0 && (
                  <li className="px-1 text-sm text-slate-500">
                    No student found.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        {student && !dues.isLoading && credit <= 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This student has no advance credit to refund.
          </p>
        )}

        {student && credit > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Amount *">
              <input
                type="number"
                min="0"
                step="0.01"
                max={credit}
                className="input mt-1.5 font-normal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Paid back by *">
              <select
                className="input mt-1.5 font-normal"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
              >
                {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            {NEEDS_REFERENCE.includes(method) && (
              <Field
                label={
                  method === "CHEQUE"
                    ? "Cheque number *"
                    : "Transaction reference *"
                }
                className="sm:col-span-2"
              >
                <input
                  className="input mt-1.5 font-normal"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
            )}
            <Field label="Reason *" className="sm:col-span-2">
              <input
                required
                minLength={3}
                className="input mt-1.5 font-normal"
                placeholder="Student left the school, overpaid…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
        )}

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
            disabled={save.isPending || !student || credit <= 0}
          >
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Request refund
          </button>
        </div>
      </form>
    </div>
  );
}

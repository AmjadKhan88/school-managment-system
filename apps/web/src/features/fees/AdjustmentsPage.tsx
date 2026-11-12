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
import { fmtMoney } from "./shared";

type AdjType = "FINE_WAIVER" | "EXTRA_DISCOUNT";
const TYPE_LABEL: Record<AdjType, string> = {
  FINE_WAIVER: "Fine waived",
  EXTRA_DISCOUNT: "Extra discount",
};

interface Row {
  id: string;
  type: AdjType;
  amount: string;
  reason: string;
  createdAt: string;
  invoiceNo: string;
  periodKey: string;
  student: { admissionNo: string; fullName: string };
  createdBy: string | null;
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
  totalDue: string;
}
interface DueInvoice {
  id: string;
  invoiceNo: string;
  periodKey: string;
  totalAmount: string;
  paidAmount: string;
  fineAmount: string;
  balance: string;
}
interface Dues {
  invoices: DueInvoice[];
}

const monthLabel = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default function AdjustmentsPage() {
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);
  const qc = useQueryClient();

  const params = {
    q: dq || undefined,
    type: type || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["fees", "adjustments", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/adjustments", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Fee Adjustments"
        subtitle="Waive a late fine or give an extra discount on an issued invoice. Every change is recorded with a reason."
        actions={
          can("fees", "APPROVE") && (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              New adjustment
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
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All adjustments</option>
          <option value="FINE_WAIVER">Fine waived</option>
          <option value="EXTRA_DISCOUNT">Extra discount</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Date",
                "Student",
                "Invoice",
                "Adjustment",
                "Amount",
                "Reason",
                "By",
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
                  {apiMessage(list.error, "Could not load adjustments")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No adjustments yet.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.invoiceNo}
                  <span className="block text-xs text-slate-500">
                    {monthLabel(r.periodKey)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.type === "FINE_WAIVER" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {TYPE_LABEL[r.type]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {fmtMoney(r.amount)}
                </td>
                <td className="px-4 py-3">{r.reason}</td>
                <td className="px-4 py-3">{r.createdBy ?? "—"}</td>
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
        <NewAdjustment
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["fees"] });
          }}
        />
      )}
    </>
  );
}

function NewAdjustment({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const ds = useDebounced(search.trim());
  const [student, setStudent] = useState<Found | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [type, setType] = useState<AdjType>("FINE_WAIVER");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const found = useQuery({
    queryKey: ["fees", "adj-search", ds],
    enabled: ds.length >= 2 && !student,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/fees/payments/search", {
          params: { q: ds },
        })
      ).data.data,
  });
  const dues = useQuery({
    queryKey: ["fees", "adj-dues", student?.id],
    enabled: !!student,
    queryFn: async () =>
      (
        await api.get<{ data: Dues }>(
          `/fees/payments/student/${student!.id}/dues`,
        )
      ).data.data,
  });
  const invoice = dues.data?.invoices.find((i) => i.id === invoiceId);
  const maxAmount = invoice
    ? type === "FINE_WAIVER"
      ? Number(invoice.fineAmount)
      : Number(invoice.balance)
    : 0;

  const save = useMutation({
    mutationFn: () =>
      api.post("/fees/adjustments", {
        invoiceId,
        type,
        amount: Number(amount),
        reason,
      }),
    onSuccess: () => {
      toast.success("Adjustment recorded");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) {
      toast.error("Choose an invoice");
      return;
    }
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount above 0");
      return;
    }
    if (Number(amount) > maxAmount) {
      toast.error(`The most you can adjust here is ${fmtMoney(maxAmount)}`);
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
          <h2 className="text-lg font-bold">New fee adjustment</h2>
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
                <strong>{student.fullName}</strong> · {student.admissionNo}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => {
                  setStudent(null);
                  setInvoiceId("");
                }}
              >
                Change
              </button>
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
                        {f.admissionNo} · Dues {fmtMoney(f.totalDue)}
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

        {student && (
          <div className="mt-4 space-y-4">
            {dues.isLoading && (
              <Loader2 className="animate-spin text-slate-400" size={18} />
            )}
            {dues.data?.invoices.length === 0 && (
              <p className="text-sm text-slate-500">
                This student has no open invoices to adjust.
              </p>
            )}
            {!!dues.data?.invoices.length && (
              <>
                <Field label="Invoice *">
                  <select
                    required
                    className="input mt-1.5 font-normal"
                    value={invoiceId}
                    onChange={(e) => setInvoiceId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {dues.data.invoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {monthLabel(i.periodKey)} · {i.invoiceNo} · balance{" "}
                        {fmtMoney(i.balance)}
                        {Number(i.fineAmount)
                          ? ` (fine ${fmtMoney(i.fineAmount)})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Adjustment *">
                    <select
                      className="input mt-1.5 font-normal"
                      value={type}
                      onChange={(e) => setType(e.target.value as AdjType)}
                    >
                      <option value="FINE_WAIVER">Waive late fine</option>
                      <option value="EXTRA_DISCOUNT">Extra discount</option>
                    </select>
                  </Field>
                  <Field
                    label={`Amount *${invoice ? ` (max ${fmtMoney(maxAmount)})` : ""}`}
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input mt-1.5 font-normal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>
                </div>
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {type === "FINE_WAIVER"
                    ? "Waiving any part of the fine also stops that invoice from collecting more fine."
                    : "An extra discount reduces the unpaid fees on this invoice. It cannot exceed the unpaid fees (the fine is not discountable)."}
                </p>
                <Field label="Reason *">
                  <input
                    required
                    minLength={3}
                    className="input mt-1.5 font-normal"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </>
            )}
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
          <button className="btn-primary" disabled={save.isPending || !invoice}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Apply adjustment
          </button>
        </div>
      </form>
    </div>
  );
}

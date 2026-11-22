import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday, thisMonth } from "@/features/finance/shared";
import { Field, fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  METHOD_LABEL,
  money,
  monthName,
  PAY_METHODS,
  RunRow,
  RunsData,
} from "./shared";

interface Pay {
  id: string;
  receiptNo: string;
  paidOn: string;
  amount: string;
  method: string;
  reference: string | null;
  reversedAt: string | null;
  reverseReason: string | null;
  employee: { id: string; employeeNo: string; fullName: string };
  period: string;
}
interface Paged {
  items: Pay[];
  total: number;
  page: number;
  pageSize: number;
  totalPaid: string;
}

export default function SalaryPaymentsPage() {
  const [tab, setTab] = useState<"pay" | "history">("pay");
  return (
    <>
      <PageHeader
        title="Salary Payments"
        subtitle="Record salary paid to employees. Payments are never deleted. A mistake is reversed with a reason."
      />
      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ["pay", "To pay"],
            ["history", "Payment history"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
              tab === k
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "pay" ? <ToPay /> : <History />}
    </>
  );
}

function ToPay() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [period, setPeriod] = useState(thisMonth());
  const [paying, setPaying] = useState<RunRow | null>(null);
  const runs = useQuery({
    queryKey: ["payroll", "runs", period],
    queryFn: async () =>
      (
        await api.get<{ data: RunsData }>("/payroll/runs", {
          params: { period },
        })
      ).data.data,
  });
  const rows = (runs.data?.items ?? []).filter((r) => r.status === "APPROVED");
  const unpaid = rows.filter((r) => Number(r.balance) > 0);

  return (
    <>
      <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Month">
          <input
            type="month"
            className="input mt-1.5 font-normal"
            max={thisMonth()}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>
        <div className="self-end pb-2 text-sm text-slate-600">
          {runs.data
            ? `${unpaid.length} of ${rows.length} approved salaries still to pay`
            : ""}
        </div>
        <div className="self-end pb-2 text-sm font-semibold">
          {runs.data ? `Balance: ${money(runs.data.summary.balance)}` : ""}
        </div>
      </div>
      {runs.data && runs.data.summary.drafts > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {runs.data.summary.drafts} payroll(s) for {monthName(period)} are
          still drafts. Approve them under Monthly Payroll before paying.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Bank</th>
              {["Net salary", "Paid", "Balance"].map((h) => (
                <th key={h} className="px-4 py-3 text-right">
                  {h}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {runs.data && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No approved payroll for {monthName(period)}.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  {r.employee.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.employee.employeeNo} · {r.slipNo}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.employee.bankName
                    ? `${r.employee.bankName}${r.employee.accountLast4 ? ` ····${r.employee.accountLast4}` : ""}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">{money(r.net)}</td>
                <td className="px-4 py-3 text-right">{money(r.paid)}</td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-bold",
                    Number(r.balance) > 0
                      ? "text-amber-700"
                      : "text-emerald-700",
                  )}
                >
                  {money(r.balance)}
                </td>
                <td className="px-4 py-2 text-right">
                  {Number(r.balance) > 0 && can("payroll", "CREATE") && (
                    <button
                      className="btn-primary py-1.5"
                      onClick={() => setPaying(r)}
                    >
                      Pay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paying && (
        <PayDialog
          row={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            qc.invalidateQueries({ queryKey: ["payroll"] });
          }}
        />
      )}
    </>
  );
}

function PayDialog({
  row,
  onClose,
  onSaved,
}: {
  row: RunRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    amount: row.balance,
    paidOn: localToday(),
    method: row.employee.bankName ? "BANK_TRANSFER" : "CASH",
    reference: "",
    note: "",
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      api.post<{ data: { receiptNo: string; balance: string } }>(
        "/payroll/payments",
        {
          payrollId: row.id,
          amount: Number(f.amount),
          paidOn: f.paidOn,
          method: f.method,
          reference: f.reference || undefined,
          note: f.note || undefined,
        },
      ),
    onSuccess: (r) => {
      toast.success(`Payment ${r.data.data.receiptNo} recorded`);
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const over = Number(f.amount) > Number(row.balance);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Pay salary</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {row.employee.fullName} · {row.slipNo} · balance{" "}
          <strong>{money(row.balance)}</strong>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Amount *"
            error={over ? "More than the balance" : undefined}
          >
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              className="input mt-1.5 font-normal"
              value={f.amount}
              onChange={set("amount")}
            />
          </Field>
          <Field label="Date *">
            <input
              required
              type="date"
              max={localToday()}
              className="input mt-1.5 font-normal"
              value={f.paidOn}
              onChange={set("paidOn")}
            />
          </Field>
          <Field label="Method *">
            <select
              className="input mt-1.5 font-normal"
              value={f.method}
              onChange={set("method")}
            >
              {PAY_METHODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference">
            <input
              className="input mt-1.5 font-normal"
              placeholder="Transfer or cheque no"
              value={f.reference}
              onChange={set("reference")}
            />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <input
              className="input mt-1.5 font-normal"
              value={f.note}
              onChange={set("note")}
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
          <button
            className="btn-primary"
            disabled={save.isPending || over || !(Number(f.amount) > 0)}
          >
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Record payment
          </button>
        </div>
      </form>
    </div>
  );
}

function History() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const params = {
    method: method || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 20,
  };
  const q = useQuery({
    queryKey: ["payroll", "payments", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/payroll/payments", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const reverse = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/payroll/payments/${v.id}/reverse`, { reason: v.reason }),
    onSuccess: () => {
      toast.success("Payment reversed. The balance is open again.");
      qc.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const askReverse = (id: string) => {
    const reason = window.prompt(
      "Why is this payment being reversed? This is recorded.",
    );
    if (reason && reason.trim().length >= 3)
      reverse.mutate({ id, reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  return (
    <>
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <select
          className="input"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
          }}
          aria-label="Method"
        >
          <option value="">All methods</option>
          {PAY_METHODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="From"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          type="date"
          className="input"
          aria-label="To"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {d && (
        <p className="mb-2 text-sm font-semibold">
          Total paid (not counting reversed): {money(d.totalPaid)}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Receipt",
                "Date",
                "Employee",
                "Month",
                "Method",
                "Reference",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No payments match.
                </td>
              </tr>
            )}
            {d?.items.map((p) => (
              <tr
                key={p.id}
                className={cn(
                  "border-b border-line last:border-0",
                  p.reversedAt && "text-slate-400",
                )}
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {p.receiptNo}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(p.paidOn)}
                </td>
                <td className="px-4 py-3">
                  {p.employee.fullName}
                  <span className="block text-xs">{p.employee.employeeNo}</span>
                </td>
                <td className="px-4 py-3">{monthName(p.period)}</td>
                <td className="px-4 py-3">{METHOD_LABEL[p.method]}</td>
                <td className="px-4 py-3">{p.reference ?? "—"}</td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-semibold",
                    p.reversedAt && "line-through",
                  )}
                >
                  {money(p.amount)}
                </td>
                <td className="px-4 py-2 text-right">
                  {p.reversedAt ? (
                    <span
                      className="text-xs text-rose-600"
                      title={p.reverseReason ?? ""}
                    >
                      Reversed
                    </span>
                  ) : (
                    can("payroll", "APPROVE") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        onClick={() => askReverse(p.id)}
                      >
                        Reverse
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && d.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(d.page - 1) * d.pageSize + 1}–
              {Math.min(d.page * d.pageSize, d.total)} of {d.total}
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
    </>
  );
}

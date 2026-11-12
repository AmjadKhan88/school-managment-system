import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { ReceiptDialog } from "./ReceiptDialog";
import { fmtMoney, METHOD_LABEL, Method, NEEDS_REFERENCE } from "./shared";

interface Found {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  status: string;
  className: string | null;
  section: string | null;
  totalDue: string;
}
interface DueInvoice {
  id: string;
  invoiceNo: string;
  periodKey: string;
  dueDate: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  fineAmount: string;
  projectedFine: string;
  balance: string;
  overdue: boolean;
}
interface Dues {
  student: Found & {};
  invoices: DueInvoice[];
  totalDue: string;
  creditBalance: string;
}
interface MethodRow {
  method: Method;
  amount: string;
  reference: string;
}

const cents = (v: string | number) => Math.round(Number(v || 0) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};
const monthLabel = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const newKey = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function CollectionPage({ quick = false }: { quick?: boolean }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);

  const [search, setSearch] = useState("");
  const ds = useDebounced(search.trim());
  const [studentId, setStudentId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<MethodRow[]>([
    { method: "CASH", amount: "", reference: "" },
  ]);
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [allowAdvance, setAllowAdvance] = useState(false);
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState(newKey());
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const found = useQuery({
    queryKey: ["fees", "collect-search", ds],
    enabled: ds.length >= 2 && !studentId,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/fees/payments/search", {
          params: { q: ds },
        })
      ).data.data,
  });
  const dues = useQuery({
    queryKey: ["fees", "dues", studentId],
    enabled: !!studentId,
    queryFn: async () =>
      (
        await api.get<{ data: Dues }>(
          `/fees/payments/student/${studentId}/dues`,
        )
      ).data.data,
  });

  // Whenever the dues load, select everything and propose paying it in full.
  useEffect(() => {
    if (!dues.data) return;
    setSelected(new Set(dues.data.invoices.map((i) => i.id)));
    setRows([
      {
        method: "CASH",
        amount: dues.data.totalDue === "0.00" ? "" : dues.data.totalDue,
        reference: "",
      },
    ]);
    setAllowAdvance(false);
  }, [dues.data]);

  const invoices = dues.data?.invoices ?? [];
  const selectedDue = useMemo(
    () =>
      invoices
        .filter((i) => selected.has(i.id))
        .reduce((s, i) => s + cents(i.balance), 0),
    [invoices, selected],
  );
  const received = rows.reduce((s, r) => s + cents(r.amount), 0);
  const extra = Math.max(0, received - selectedDue);
  const applied = Math.min(received, selectedDue);
  const remainingAfter = cents(dues.data?.totalDue ?? 0) - applied;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    on ? next.add(id) : next.delete(id);
    setSelected(next);
    const due = invoices
      .filter((i) => next.has(i.id))
      .reduce((s, i) => s + cents(i.balance), 0);
    setRows([
      {
        method: rows[0]?.method ?? "CASH",
        amount: due ? fromCents(due) : "",
        reference: "",
      },
    ]);
    setAllowAdvance(false);
  };
  const setRow = (i: number, patch: Partial<MethodRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const pay = useMutation({
    mutationFn: () =>
      api.post<{ data: { id: string; receiptNo: string; duplicate: boolean } }>(
        "/fees/payments/collect",
        {
          studentId,
          paymentDate,
          allowAdvance,
          notes: notes || undefined,
          idempotencyKey: key,
          invoiceIds: selected.size ? [...selected] : undefined,
          methods: rows.map((r) => ({
            method: r.method,
            amount: Number(r.amount),
            reference: r.reference || undefined,
          })),
        },
      ),
    onSuccess: (res) => {
      toast.success(`Receipt ${res.data.data.receiptNo} issued`);
      setReceiptId(res.data.data.id);
      setKey(newKey());
      setNotes("");
      qc.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const credit = useMutation({
    mutationFn: () =>
      api.post<{ data: { applied: string } }>("/fees/payments/apply-credit", {
        studentId,
      }),
    onSuccess: (res) => {
      toast.success(
        `Applied ${fmtMoney(res.data.data.applied)} of advance credit`,
      );
      qc.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (received <= 0) {
      toast.error("Enter the amount received");
      return;
    }
    for (const r of rows) {
      if (cents(r.amount) <= 0) {
        toast.error("Every payment method needs an amount above 0");
        return;
      }
      if (NEEDS_REFERENCE.includes(r.method) && !r.reference.trim()) {
        toast.error(`Enter the reference for ${METHOD_LABEL[r.method]}`);
        return;
      }
    }
    if (new Set(rows.map((r) => r.method)).size !== rows.length) {
      toast.error("Each payment method can be used once");
      return;
    }
    if (extra > 0 && !allowAdvance) {
      toast.error("Confirm that the extra amount is kept as advance credit");
      return;
    }
    pay.mutate();
  };

  const clearStudent = () => {
    setStudentId("");
    setSearch("");
    setSelected(new Set());
    setRows([{ method: "CASH", amount: "", reference: "" }]);
  };
  const s = dues.data?.student;

  if (!can("fee_collection", "CREATE"))
    return (
      <div className="card p-8 text-sm text-slate-600">
        You do not have permission to collect fees.
      </div>
    );

  return (
    <>
      <PageHeader
        title={quick ? "Quick Fee Collection" : "Fee Collection"}
        subtitle={
          quick
            ? "Search, choose the months, receive, print."
            : "Receive full, partial or advance payments. Money is applied to the oldest selected month first."
        }
      />

      <div className="card p-5">
        {studentId && s ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold text-ink-950">
                {s.fullName}
              </p>
              <p className="text-sm text-slate-600">
                {s.admissionNo} ·{" "}
                {s.className
                  ? `${s.className} / ${s.section}`
                  : "No enrollment"}{" "}
                · Father: {s.fatherName}
                {s.status !== "ACTIVE" ? ` · ${s.status.toLowerCase()}` : ""}
              </p>
            </div>
            <button
              className="btn border border-slate-300"
              onClick={clearStudent}
            >
              Change student
            </button>
          </div>
        ) : (
          <>
            <div className="relative max-w-xl">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="input pl-9"
                autoFocus
                placeholder="Admission number or student name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ul className="mt-3 max-w-xl space-y-1">
              {ds.length < 2 && (
                <li className="px-1 text-xs text-slate-500">
                  Type at least 2 characters.
                </li>
              )}
              {found.isFetching && (
                <li className="px-1">
                  <Loader2 size={16} className="animate-spin text-slate-400" />
                </li>
              )}
              {found.data?.length === 0 && (
                <li className="px-1 text-sm text-slate-500">
                  No student found.
                </li>
              )}
              {found.data?.map((f) => (
                <li key={f.id}>
                  <button
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => setStudentId(f.id)}
                  >
                    <span>
                      <span className="font-semibold">{f.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {f.admissionNo} ·{" "}
                        {f.className
                          ? `${f.className} / ${f.section}`
                          : "No enrollment"}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-semibold ${Number(f.totalDue) > 0 ? "text-rose-600" : "text-emerald-600"}`}
                    >
                      {Number(f.totalDue) > 0
                        ? `Due ${fmtMoney(f.totalDue)}`
                        : "No dues"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {studentId && dues.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {studentId && dues.isError && (
        <div className="card mt-4 p-6 text-center text-sm text-rose-600">
          {apiMessage(dues.error, "Could not load dues")}
        </div>
      )}

      {dues.data && (
        <form
          onSubmit={submit}
          className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]"
        >
          <div className="space-y-4">
            {Number(dues.data.creditBalance) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <span>
                  Advance credit available:{" "}
                  <strong>{fmtMoney(dues.data.creditBalance)}</strong>
                </span>
                {invoices.length > 0 && (
                  <button
                    type="button"
                    className="btn border border-emerald-600 py-1.5 text-emerald-700"
                    disabled={credit.isPending}
                    onClick={() => credit.mutate()}
                  >
                    {credit.isPending && (
                      <Loader2 size={14} className="animate-spin" />
                    )}
                    Apply credit to open invoices
                  </button>
                )}
              </div>
            )}

            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No open invoices. Any amount received will be kept as
                        advance credit.
                      </td>
                    </tr>
                  )}
                  {invoices.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected.has(i.id)}
                          onChange={(e) => toggle(i.id, e.target.checked)}
                          aria-label={`Select ${monthLabel(i.periodKey)}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        {monthLabel(i.periodKey)}
                        {i.status === "PARTIAL" && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            Partial
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {fmtDate(i.dueDate)}
                        {i.overdue && (
                          <span className="ml-2 text-xs font-semibold text-rose-600">
                            Overdue
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {fmtMoney(i.totalAmount)}
                        {Number(i.projectedFine) > Number(i.fineAmount) && (
                          <span className="block text-xs text-rose-600">
                            + fine to date{" "}
                            {fmtMoney(
                              Number(i.projectedFine) - Number(i.fineAmount),
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{fmtMoney(i.paidAmount)}</td>
                      <td className="px-4 py-3 font-semibold">
                        {fmtMoney(i.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length > 0 && (
                <p className="border-t border-line px-4 py-2 text-xs text-slate-500">
                  Late fines are brought up to the payment date when you receive
                  the payment, so the final balance can be slightly higher.
                </p>
              )}
            </div>
          </div>

          <div className="card h-fit p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink-950">
              <Wallet size={18} />
              Receive payment
            </h2>

            {!quick && (
              <Field label="Payment date" className="mt-4">
                <input
                  type="date"
                  max={localToday()}
                  className="input mt-1.5 font-normal"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </Field>
            )}

            <div className="mt-4 space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl border border-line p-3">
                  <div className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
                    <select
                      className="input"
                      value={r.method}
                      onChange={(e) =>
                        setRow(i, { method: e.target.value as Method })
                      }
                      aria-label="Payment method"
                    >
                      {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABEL[m]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input"
                      placeholder="Amount"
                      value={r.amount}
                      onChange={(e) => setRow(i, { amount: e.target.value })}
                      aria-label="Amount"
                    />
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRows((rs) => rs.filter((_, idx) => idx !== i))
                        }
                        className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                        aria-label="Remove method"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span className="w-9" />
                    )}
                  </div>
                  {NEEDS_REFERENCE.includes(r.method) && (
                    <input
                      className="input mt-2"
                      placeholder={
                        r.method === "CHEQUE"
                          ? "Cheque number"
                          : "Transaction reference"
                      }
                      value={r.reference}
                      onChange={(e) => setRow(i, { reference: e.target.value })}
                      aria-label="Reference"
                    />
                  )}
                </div>
              ))}
              {!quick && rows.length < 4 && (
                <button
                  type="button"
                  className="btn border border-slate-300 py-1.5"
                  onClick={() =>
                    setRows((rs) => [
                      ...rs,
                      {
                        method:
                          (Object.keys(METHOD_LABEL) as Method[]).find(
                            (m) => !rs.some((r) => r.method === m),
                          ) ?? "OTHER",
                        amount: "",
                        reference: "",
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  Split across another method
                </button>
              )}
            </div>

            <dl className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Selected dues</dt>
                <dd>{fmtMoney(selectedDue / 100)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Amount received</dt>
                <dd className="font-semibold">{fmtMoney(received / 100)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Applied to invoices</dt>
                <dd>{fmtMoney(applied / 100)}</dd>
              </div>
              {extra > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Kept as advance credit</dt>
                  <dd>{fmtMoney(extra / 100)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1 font-semibold">
                <dt>Dues left after this</dt>
                <dd>{fmtMoney(Math.max(0, remainingAfter) / 100)}</dd>
              </div>
            </dl>

            {extra > 0 && (
              <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={allowAdvance}
                  onChange={(e) => setAllowAdvance(e.target.checked)}
                />
                <span>
                  <AlertTriangle size={14} className="mr-1 inline" />
                  This is {fmtMoney(extra / 100)} more than the selected dues.
                  Keep the extra as advance credit for future months.
                </span>
              </label>
            )}

            {!quick && (
              <Field label="Note (optional)" className="mt-4">
                <input
                  className="input mt-1.5 font-normal"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            )}

            <button
              className="btn-primary mt-5 w-full py-2.5"
              disabled={pay.isPending || received <= 0}
            >
              {pay.isPending && <Loader2 size={15} className="animate-spin" />}
              Receive {received > 0 ? fmtMoney(received / 100) : "payment"}
            </button>
          </div>
        </form>
      )}

      {receiptId && (
        <ReceiptDialog id={receiptId} onClose={() => setReceiptId(null)} />
      )}
    </>
  );
}

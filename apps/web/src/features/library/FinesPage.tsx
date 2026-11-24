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
  Search,
  Settings,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { PAY_METHODS, METHOD_LABEL } from "@/features/payroll/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  FINE_STYLE,
  LibrarySettings,
  money,
  REASON_LABEL,
  useLibrarySettings,
} from "./shared";

interface Fine {
  id: string;
  fineNo: string;
  reason: string;
  amount: string;
  status: "UNPAID" | "PAID" | "WAIVED";
  note: string | null;
  createdAt: string;
  paidOn: string | null;
  paymentMethod: string | null;
  waiveReason: string | null;
  borrower: { name: string; detail: string };
  book: string;
  accessionNo: string;
  issueNo: string;
}
interface Paged {
  items: Fine[];
  total: number;
  page: number;
  pageSize: number;
  unpaidTotal: string;
}

export default function FinesPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("UNPAID");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState<Fine | null>(null);
  const [rules, setRules] = useState(false);
  const dq = useDebounced(q);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const params = {
    q: dq || undefined,
    status: status || undefined,
    reason: reason || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["library", "fines", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/library/fines", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const refresh = () => qc.invalidateQueries();

  const withReason = useMutation({
    mutationFn: (v: {
      id: string;
      action: "waive" | "reverse";
      reason: string;
    }) => api.post(`/library/fines/${v.id}/${v.action}`, { reason: v.reason }),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "waive"
          ? "Fine waived"
          : "Payment reversed. The fine is unpaid again.",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const ask = (f: Fine, action: "waive" | "reverse") => {
    const text = window.prompt(
      action === "waive"
        ? `Why is fine ${f.fineNo} being waived?`
        : `Why is the payment of ${f.fineNo} being reversed? The income entry will be voided.`,
    );
    if (text && text.trim().length >= 3)
      withReason.mutate({ id: f.id, action, reason: text.trim() });
    else if (text !== null)
      toast.error("Please give a reason of at least 3 characters");
  };

  return (
    <>
      <PageHeader
        title="Library Fines"
        subtitle="Fines for overdue, damaged and lost books. Collected fines are recorded as income in the Cash Book."
        actions={
          can("library", "VIEW") && (
            <button
              className="btn border border-slate-300"
              onClick={() => setRules(true)}
            >
              <Settings size={16} />
              Library rules
            </button>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Fine no, borrower or book"
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
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="WAIVED">Waived</option>
        </select>
        <select
          className="input"
          value={reason}
          onChange={(e) => reset(setReason)(e.target.value)}
          aria-label="Reason"
        >
          <option value="">All reasons</option>
          {Object.entries(REASON_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {d && (
        <p className="mb-2 text-sm font-semibold">
          Unpaid in this view: {money(d.unpaidTotal)}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {["Fine", "Borrower", "Book", "Reason"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th />
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
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No fines match.
                </td>
              </tr>
            )}
            {d?.items.map((f) => (
              <tr key={f.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {f.fineNo}
                  <span className="block text-xs font-normal text-slate-500">
                    {fmtDate(f.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {f.borrower.name}
                  <span className="block text-xs text-slate-500">
                    {f.borrower.detail}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {f.book}
                  <span className="block text-xs text-slate-500">
                    {f.accessionNo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {REASON_LABEL[f.reason]}
                  {f.note && (
                    <span className="block text-xs text-slate-500">
                      {f.note}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {money(f.amount)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      FINE_STYLE[f.status],
                    )}
                  >
                    {f.status === "UNPAID"
                      ? "Unpaid"
                      : f.status === "PAID"
                        ? "Paid"
                        : "Waived"}
                  </span>
                  {f.paidOn && (
                    <span className="block text-xs text-slate-500">
                      {fmtDate(f.paidOn)} ·{" "}
                      {f.paymentMethod ? METHOD_LABEL[f.paymentMethod] : ""}
                    </span>
                  )}
                  {f.waiveReason && (
                    <span className="block text-xs text-slate-500">
                      {f.waiveReason}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {f.status === "UNPAID" && can("library", "CREATE") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        onClick={() => setPay(f)}
                      >
                        Collect
                      </button>
                    )}
                    {f.status === "UNPAID" && can("library", "APPROVE") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        onClick={() => ask(f, "waive")}
                      >
                        Waive
                      </button>
                    )}
                    {f.status === "PAID" && can("library", "APPROVE") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        onClick={() => ask(f, "reverse")}
                      >
                        Reverse
                      </button>
                    )}
                  </div>
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

      {pay && (
        <PayDialog
          fine={pay}
          onClose={() => setPay(null)}
          onSaved={() => {
            setPay(null);
            refresh();
          }}
        />
      )}
      {rules && <RulesDialog onClose={() => setRules(false)} />}
    </>
  );
}

function PayDialog({
  fine,
  onClose,
  onSaved,
}: {
  fine: Fine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    paidOn: localToday(),
    method: "CASH",
    reference: "",
  });
  const save = useMutation({
    mutationFn: () =>
      api.post<{ data: { incomeNo: string } }>(
        `/library/fines/${fine.id}/pay`,
        {
          paidOn: f.paidOn,
          method: f.method,
          reference: f.reference || undefined,
        },
      ),
    onSuccess: (r) => {
      toast.success(`Collected. Recorded as income ${r.data.data.incomeNo}.`);
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
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
        className="card w-full max-w-sm p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Collect fine</h2>
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
          {fine.fineNo} · {fine.borrower.name} ·{" "}
          <strong>{money(fine.amount)}</strong>
        </p>
        <div className="mt-4 space-y-4">
          <Field label="Received on *">
            <input
              required
              type="date"
              max={localToday()}
              className="input mt-1.5 font-normal"
              value={f.paidOn}
              onChange={(e) => setF({ ...f, paidOn: e.target.value })}
            />
          </Field>
          <Field label="Method *">
            <select
              className="input mt-1.5 font-normal"
              value={f.method}
              onChange={(e) => setF({ ...f, method: e.target.value })}
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
              value={f.reference}
              onChange={(e) => setF({ ...f, reference: e.target.value })}
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
            Collect {money(fine.amount)}
          </button>
        </div>
      </form>
    </div>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const s = useLibrarySettings();
  const [f, setF] = useState<Record<keyof LibrarySettings, string> | null>(
    null,
  );
  const form =
    f ??
    (s.data
      ? (Object.fromEntries(
          Object.entries(s.data).map(([k, v]) => [k, String(v)]),
        ) as Record<keyof LibrarySettings, string>)
      : null);
  const save = useMutation({
    mutationFn: () =>
      api.put(
        "/library/settings",
        Object.fromEntries(
          Object.entries(form!).map(([k, v]) => [k, Number(v)]),
        ),
      ),
    onSuccess: () => {
      toast.success("Library rules saved");
      qc.invalidateQueries({ queryKey: ["library"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const row = (k: keyof LibrarySettings, label: string, step = "1") =>
    form && (
      <Field label={label} key={k}>
        <input
          type="number"
          min="0"
          step={step}
          disabled={!can("library", "EDIT")}
          className="input mt-1.5 font-normal"
          value={form[k]}
          onChange={(e) => setF({ ...form, [k]: e.target.value })}
        />
      </Field>
    );
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
          <h2 className="text-lg font-bold">Library rules</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {s.isLoading && (
          <Loader2 className="mx-auto my-8 animate-spin text-slate-400" />
        )}
        {form && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {row("finePerDay", "Fine per overdue day", "0.5")}
            {row("maxRenewals", "Renewals allowed")}
            {row("loanDaysStudent", "Loan period, students (days)")}
            {row("loanDaysEmployee", "Loan period, staff (days)")}
            {row("maxBooksStudent", "Books at a time, students")}
            {row("maxBooksEmployee", "Books at a time, staff")}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          New rules apply to future issues and returns. Loans already out keep
          their due dates.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Close
          </button>
          {can("library", "EDIT") && form && (
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Loader2 size={15} className="animate-spin" />}
              Save
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

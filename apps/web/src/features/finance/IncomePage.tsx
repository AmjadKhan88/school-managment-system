import {
  keepPreviousData,
  useMutation,
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
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import {
  fmtMoney,
  METHOD_LABEL,
  Method,
  NEEDS_REFERENCE,
} from "@/features/fees/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { localToday, SOURCE_LABEL } from "./shared";

interface Row {
  id: string;
  incomeNo: string;
  source: string;
  description: string;
  amount: string;
  incomeDate: string;
  method: Method;
  receivedFrom: string | null;
  reference: string | null;
  status: "ACTIVE" | "VOIDED";
  voidReason: string | null;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: string };
}

export default function IncomePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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

  const filters = {
    q: dq || undefined,
    source: source || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const params = { ...filters, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ["finance", "income", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/finance/income", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  const voidIt = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/finance/income/${v.id}/void`, { reason: v.reason }),
    onSuccess: () => {
      toast.success("Entry voided");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const askVoid = (id: string) => {
    const reason = window.prompt(
      "Reason for voiding this entry (it will be removed from the books):",
    );
    if (reason && reason.trim().length >= 3)
      voidIt.mutate({ id, reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/finance/income/export",
        filters,
        "other-income.xlsx",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Other Income"
        subtitle="Donations, transport income, rentals and events. Fee income comes from fee payments automatically."
        actions={
          <div className="flex flex-wrap gap-2">
            {can("income", "EXPORT") && (
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
            {can("income", "CREATE") && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} />
                Record income
              </button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">
            Active income (this filter)
          </p>
          <p className="mt-1 text-xl font-extrabold text-emerald-600">
            {data ? fmtMoney(data.summary.total) : "—"}
          </p>
        </div>
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search description, donor, no"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={source}
          onChange={(e) => reset(setSource)(e.target.value)}
          aria-label="Source"
        >
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="From date"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <input
          type="date"
          className="input"
          aria-label="To date"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Income",
                "Date",
                "Source",
                "Description",
                "Received from",
                "Method",
                "Amount",
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
                <td colSpan={9} className="px-4 py-10 text-center">
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
                  colSpan={9}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load income")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No income entries match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-line last:border-0 ${r.status === "VOIDED" ? "text-slate-400" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.incomeNo}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.incomeDate)}
                </td>
                <td className="px-4 py-3">{SOURCE_LABEL[r.source]}</td>
                <td className="px-4 py-3">{r.description}</td>
                <td className="px-4 py-3">{r.receivedFrom ?? "—"}</td>
                <td className="px-4 py-3">
                  {METHOD_LABEL[r.method]}
                  {r.reference ? (
                    <span className="block text-xs text-slate-500">
                      {r.reference}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {fmtMoney(r.amount)}
                </td>
                <td className="px-4 py-3">
                  {r.status === "ACTIVE" ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span
                      title={r.voidReason ?? ""}
                      className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
                    >
                      Voided
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "ACTIVE" && can("income", "APPROVE") && (
                    <button
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() => askVoid(r.id)}
                    >
                      Void
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

      {adding && (
        <AddIncome
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

function AddIncome({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    source: "DONATION",
    description: "",
    amount: "",
    incomeDate: localToday(),
    method: "CASH" as Method,
    receivedFrom: "",
    reference: "",
  });
  const set =
    (k: keyof typeof f) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      api.post("/finance/income", {
        ...f,
        amount: Number(f.amount),
        receivedFrom: f.receivedFrom || undefined,
        reference: f.reference || undefined,
      }),
    onSuccess: () => {
      toast.success("Income recorded");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) {
      toast.error("Enter an amount above 0");
      return;
    }
    if (NEEDS_REFERENCE.includes(f.method) && !f.reference.trim()) {
      toast.error("Enter the reference for this payment method");
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
          <h2 className="text-lg font-bold">Record income</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Source *">
            <select
              className="input mt-1.5 font-normal"
              value={f.source}
              onChange={set("source")}
            >
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount *">
            <input
              required
              type="number"
              min="0"
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
              value={f.incomeDate}
              onChange={set("incomeDate")}
            />
          </Field>
          <Field label="Received by *">
            <select
              className="input mt-1.5 font-normal"
              value={f.method}
              onChange={set("method")}
            >
              {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Received from">
            <input
              className="input mt-1.5 font-normal"
              placeholder="Donor or payer"
              value={f.receivedFrom}
              onChange={set("receivedFrom")}
            />
          </Field>
          {NEEDS_REFERENCE.includes(f.method) && (
            <Field
              label={
                f.method === "CHEQUE"
                  ? "Cheque number *"
                  : "Transaction reference *"
              }
            >
              <input
                className="input mt-1.5 font-normal"
                value={f.reference}
                onChange={set("reference")}
              />
            </Field>
          )}
          <Field label="Description *" className="sm:col-span-2">
            <textarea
              required
              minLength={3}
              rows={2}
              className="input mt-1.5 font-normal"
              value={f.description}
              onChange={set("description")}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Entries cannot be edited. If something is wrong, void the entry with a
          reason and record it again.
        </p>
        <div className="mt-5 flex justify-end gap-2">
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

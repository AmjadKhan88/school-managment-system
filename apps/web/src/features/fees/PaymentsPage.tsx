import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { ReceiptDialog } from "./ReceiptDialog";
import { fmtMoney, METHOD_LABEL, Method } from "./shared";

interface Row {
  id: string;
  receiptNo: string;
  kind: "PAYMENT" | "REVERSAL";
  status: "POSTED" | "REVERSED";
  paymentDate: string;
  totalAmount: string;
  methods: Method[];
  student: { admissionNo: string; fullName: string };
  receivedBy: string | null;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  summary: { net: string; byMethod: { method: Method; amount: string }[] };
}

export default function PaymentsPage() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const params = {
    q: dq || undefined,
    from: from || undefined,
    to: to || undefined,
    method: method || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["fees", "payments", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/payments", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Payment History"
        subtitle="Every receipt and reversal. Net collection counts reversals as negative entries on the day they happened."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4 lg:col-span-1">
          <p className="text-xs font-semibold text-slate-500">
            Net collected (filtered)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-ink-950">
            {data ? fmtMoney(data.summary.net) : "—"}
          </p>
        </div>
        <div className="card p-4 sm:col-span-1 lg:col-span-3">
          <p className="text-xs font-semibold text-slate-500">
            By payment method
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data?.summary.byMethod.length === 0 && (
              <span className="text-sm text-slate-500">
                No payments in this view.
              </span>
            )}
            {data?.summary.byMethod.map((m) => (
              <span
                key={m.method}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold"
              >
                {METHOD_LABEL[m.method]}: {fmtMoney(m.amount)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Student name or admission no"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
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
        <select
          className="input"
          value={method}
          onChange={(e) => reset(setMethod)(e.target.value)}
          aria-label="Payment method"
        >
          <option value="">All methods</option>
          {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">All</option>
          <option value="POSTED">Active</option>
          <option value="REVERSED">Reversed</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Receipt",
                "Date",
                "Student",
                "Method",
                "Amount",
                "Received by",
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
                  {apiMessage(list.error, "Could not load payments")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No payments match these filters.
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
                  {r.receiptNo}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.paymentDate)}
                </td>
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.methods.map((m) => METHOD_LABEL[m]).join(", ")}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 font-semibold ${Number(r.totalAmount) < 0 ? "text-rose-600" : ""}`}
                >
                  {Number(r.totalAmount) < 0
                    ? `-${fmtMoney(Math.abs(Number(r.totalAmount)))}`
                    : fmtMoney(r.totalAmount)}
                </td>
                <td className="px-4 py-3">{r.receivedBy ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.kind === "REVERSAL" ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      Reversal entry
                    </span>
                  ) : r.status === "REVERSED" ? (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                      Reversed
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Received
                    </span>
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

      {openId && (
        <ReceiptDialog id={openId} reprint onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

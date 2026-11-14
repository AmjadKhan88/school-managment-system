import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtMoney, METHOD_LABEL, Method } from "@/features/fees/shared";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { firstOfThisMonth, localToday } from "./shared";

type Account = "ALL" | "CASH" | "NON_CASH";
interface Result {
  from: string;
  to: string;
  account: Account;
  truncated: boolean;
  rows: {
    date: string;
    kind: string;
    ref: string;
    method: Method;
    description: string;
    moneyIn: string | null;
    moneyOut: string | null;
    balance: string;
  }[];
  totals: { opening: string; in: string; out: string; closing: string };
}
const TABS: [Account, string][] = [
  ["ALL", "All accounts"],
  ["CASH", "Cash only"],
  ["NON_CASH", "Bank and wallets"],
];

export default function CashBookPage({
  title = "Cash Book",
  subtitle,
  lockedAccount,
}: {
  title?: string;
  subtitle?: string;
  lockedAccount?: Account;
}) {
  const can = useAuth((s) => s.can);
  const [from, setFrom] = useState(firstOfThisMonth());
  const [to, setTo] = useState(localToday());
  const [pick, setPick] = useState<Account>("ALL");
  const [exporting, setExporting] = useState(false);
  const account = lockedAccount ?? pick;

  const params = { from, to, account };
  const q = useQuery({
    queryKey: ["finance", "cash-book", params],
    enabled: !!from && !!to,
    queryFn: async () =>
      (await api.get<{ data: Result }>("/finance/cash-book", { params })).data
        .data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile("/finance/cash-book/export", params, "cash-book.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const d = q.data;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          subtitle ??
          "Every receipt, refund, reversal, income and approved expense in date order with a running balance."
        }
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="input w-40"
              aria-label="From date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              className="input w-40"
              aria-label="To date"
              value={to}
              min={from}
              max={localToday()}
              onChange={(e) => setTo(e.target.value)}
            />
            <button
              className="btn border border-slate-300"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print
            </button>
            {can("finance", "EXPORT") && (
              <button
                className="btn-primary"
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
          </div>
        }
      />

      {!lockedAccount && (
        <div className="no-print mb-4 flex gap-1 border-b border-line">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPick(k)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${pick === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="hidden text-sm print:block">
        {title}: {from} to {to}.
      </p>

      {q.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load the cash book")}
        </div>
      )}

      {d && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Opening balance", d.totals.opening, ""],
              ["Money in", d.totals.in, "text-emerald-600"],
              ["Money out", d.totals.out, "text-rose-600"],
              ["Closing balance", d.totals.closing, "text-ink-950"],
            ].map(([l, v, c]) => (
              <div key={l} className="card p-4">
                <p className="text-xs font-semibold text-slate-500">{l}</p>
                <p className={`mt-1 text-xl font-extrabold ${c}`}>
                  {fmtMoney(v)}
                </p>
              </div>
            ))}
          </div>
          {d.truncated && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              This range has more entries than can be shown. Choose a shorter
              range for a complete book.
            </p>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  {[
                    "Date",
                    "Reference",
                    "Description",
                    "Method",
                    "Received",
                    "Paid",
                    "Balance",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50/70 font-semibold">
                  <td className="px-4 py-2" colSpan={6}>
                    Opening balance
                  </td>
                  <td className="px-4 py-2">{fmtMoney(d.totals.opening)}</td>
                </tr>
                {d.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No money movements in this range.
                    </td>
                  </tr>
                )}
                {d.rows.map((r, i) => (
                  <tr
                    key={`${r.ref}-${i}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {fmtDate(r.date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                      {r.ref}
                    </td>
                    <td className="px-4 py-2.5">{r.description}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {METHOD_LABEL[r.method]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-emerald-700">
                      {r.moneyIn ? fmtMoney(r.moneyIn) : ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-rose-600">
                      {r.moneyOut ? fmtMoney(r.moneyOut) : ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                      {Number(r.balance) < 0
                        ? `-${fmtMoney(Math.abs(Number(r.balance)))}`
                        : fmtMoney(r.balance)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="px-4 py-3" colSpan={4}>
                    Closing balance
                  </td>
                  <td className="px-4 py-3 text-emerald-700">
                    {fmtMoney(d.totals.in)}
                  </td>
                  <td className="px-4 py-3 text-rose-600">
                    {fmtMoney(d.totals.out)}
                  </td>
                  <td className="px-4 py-3">{fmtMoney(d.totals.closing)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

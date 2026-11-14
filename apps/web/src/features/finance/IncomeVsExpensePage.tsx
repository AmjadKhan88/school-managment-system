import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtMoney } from "@/features/fees/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { monthLabel, monthsAgo, signedMoney, thisMonth } from "./shared";

interface Row {
  month: string;
  fees: string;
  refunds: string;
  otherIncome: string;
  income: string;
  expenses: string;
  net: string;
}
interface Result {
  from: string;
  to: string;
  rows: Row[];
  totals: Omit<Row, "month">;
}

export default function IncomeVsExpensePage() {
  const can = useAuth((s) => s.can);
  const [from, setFrom] = useState(monthsAgo(5));
  const [to, setTo] = useState(thisMonth());
  const [exporting, setExporting] = useState(false);

  const params = { from, to };
  const q = useQuery({
    queryKey: ["finance", "ive", params],
    enabled: !!from && !!to,
    queryFn: async () =>
      (
        await api.get<{ data: Result }>("/finance/income-vs-expense", {
          params,
        })
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/finance/income-vs-expense/export",
        params,
        "income-vs-expense.xlsx",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const d = q.data;
  const chart =
    d?.rows.map((r) => ({
      month: monthLabel(r.month),
      Income: Number(r.income),
      Expenses: Number(r.expenses),
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Income vs Expense"
        subtitle="Income = fee collections − refunds + other income. Expenses are approved expenses only."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <input
              type="month"
              className="input w-40"
              aria-label="From month"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="month"
              className="input w-40"
              aria-label="To month"
              value={to}
              min={from}
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

      {q.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load the report")}
        </div>
      )}

      {d && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500">
                Total income
              </p>
              <p className="mt-1 text-xl font-extrabold text-emerald-600">
                {fmtMoney(d.totals.income)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500">
                Total expenses
              </p>
              <p className="mt-1 text-xl font-extrabold text-rose-600">
                {fmtMoney(d.totals.expenses)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500">
                Net balance
              </p>
              <p
                className={`mt-1 text-xl font-extrabold ${Number(d.totals.net) < 0 ? "text-rose-600" : "text-ink-950"}`}
              >
                {signedMoney(d.totals.net)}
              </p>
            </div>
          </div>

          <div className="card mb-4 p-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chart}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Bar dataKey="Income" fill="#0F8F83" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="Expenses"
                    fill="#F43F5E"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  {[
                    "Month",
                    "Fee collections",
                    "Refunds",
                    "Other income",
                    "Total income",
                    "Expenses",
                    "Net",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.month} className="border-b border-line">
                    <td className="px-4 py-3 font-semibold">
                      {monthLabel(r.month)}
                    </td>
                    <td className="px-4 py-3">{fmtMoney(r.fees)}</td>
                    <td className="px-4 py-3">
                      {Number(r.refunds) ? `-${fmtMoney(r.refunds)}` : "—"}
                    </td>
                    <td className="px-4 py-3">{fmtMoney(r.otherIncome)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      {fmtMoney(r.income)}
                    </td>
                    <td className="px-4 py-3 text-rose-600">
                      {fmtMoney(r.expenses)}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${Number(r.net) < 0 ? "text-rose-600" : ""}`}
                    >
                      {signedMoney(r.net)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3">{fmtMoney(d.totals.fees)}</td>
                  <td className="px-4 py-3">
                    {Number(d.totals.refunds)
                      ? `-${fmtMoney(d.totals.refunds)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {fmtMoney(d.totals.otherIncome)}
                  </td>
                  <td className="px-4 py-3 text-emerald-700">
                    {fmtMoney(d.totals.income)}
                  </td>
                  <td className="px-4 py-3 text-rose-600">
                    {fmtMoney(d.totals.expenses)}
                  </td>
                  <td className="px-4 py-3">{signedMoney(d.totals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="no-print mt-3 text-xs text-slate-500">
            Fee collections count money actually received (payments less
            reversals) on the date received. Invoices are never counted as
            income.
          </p>
        </>
      )}
    </>
  );
}

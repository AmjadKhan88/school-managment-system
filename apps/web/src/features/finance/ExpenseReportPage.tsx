import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { monthLabel, monthsAgo, thisMonth } from "./shared";

interface Result {
  total: string;
  byCategory: {
    category: string;
    count: number;
    amount: string;
    share: number;
  }[];
  byMonth: { month: string; amount: string }[];
}

export default function ExpenseReportPage() {
  const can = useAuth((s) => s.can);
  const [from, setFrom] = useState(monthsAgo(5));
  const [to, setTo] = useState(thisMonth());
  const [exporting, setExporting] = useState(false);

  const params = { from, to };
  const q = useQuery({
    queryKey: ["finance", "expense-summary", params],
    enabled: !!from && !!to,
    queryFn: async () =>
      (await api.get<{ data: Result }>("/finance/expense-summary", { params }))
        .data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/finance/expense-summary/export",
        params,
        "expense-summary.xlsx",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const d = q.data;
  const chart =
    d?.byMonth.map((m) => ({
      month: monthLabel(m.month),
      Expenses: Number(m.amount),
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Expense Report"
        subtitle="Monthly spending and category-wise totals of approved expenses."
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
                Total expenses
              </p>
              <p className="mt-1 text-xl font-extrabold text-rose-600">
                {fmtMoney(d.total)}
              </p>
            </div>
          </div>
          <div className="card mb-4 p-4">
            <div className="h-64">
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
                  {["Category", "Expenses", "Amount", "Share"].map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.byCategory.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No approved expenses in this period.
                    </td>
                  </tr>
                )}
                {d.byCategory.map((c) => (
                  <tr
                    key={c.category}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3 font-semibold">{c.category}</td>
                    <td className="px-4 py-3">{c.count}</td>
                    <td className="px-4 py-3">{fmtMoney(c.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-rose-400"
                            style={{ width: `${Math.min(100, c.share)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">
                          {c.share}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {d.byCategory.length > 0 && (
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3">
                      {d.byCategory.reduce((s, c) => s + c.count, 0)}
                    </td>
                    <td className="px-4 py-3">{fmtMoney(d.total)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

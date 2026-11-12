import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { fmtMoney } from "./shared";

interface Result {
  date: string;
  totals: { payments: string; reversals: string; refunds: string; net: string };
  byMethod: { method: string; label: string; amount: string }[];
  byClass: { className: string; receipts: number; amount: string }[];
  lines: {
    type: "PAYMENT" | "REVERSAL" | "REFUND";
    ref: string;
    admissionNo: string;
    student: string;
    className: string;
    methods: string;
    amount: string;
  }[];
}

const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};
const signed = (v: string) =>
  Number(v) < 0 ? `-${fmtMoney(Math.abs(Number(v)))}` : fmtMoney(v);

export default function DayWisePage() {
  const can = useAuth((s) => s.can);
  const [date, setDate] = useState(localToday());
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: ["reports", "day-wise", date],
    enabled: !!date,
    queryFn: async () =>
      (
        await api.get<{ data: Result }>("/reports/day-wise-collection", {
          params: { date },
        })
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/reports/day-wise-collection/export",
        { date },
        `day-wise-collection-${date}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const d = q.data;
  const cards = d
    ? [
        ["Payments received", d.totals.payments],
        ["Reversals", d.totals.reversals],
        ["Refunds paid", d.totals.refunds],
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Day-wise Collection"
        subtitle="Cash actually received on one date: payments, minus reversals, minus refunds paid out."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="input w-44"
              max={localToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
            />
            <button
              className="btn border border-slate-300"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print
            </button>
            {can("reports", "EXPORT") && (
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

      <p className="hidden text-sm print:block">
        Collection report for {date}.
      </p>

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
            {cards.map(([l, v]) => (
              <div key={l} className="card p-4">
                <p className="text-xs font-semibold text-slate-500">{l}</p>
                <p className="mt-1 text-xl font-extrabold text-ink-950">
                  {signed(v)}
                </p>
              </div>
            ))}
            <div className="card border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-700">
                Net collection
              </p>
              <p className="mt-1 text-xl font-extrabold text-emerald-700">
                {signed(d.totals.net)}
              </p>
            </div>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink-950">
                By payment method
              </h3>
              {d.byMethod.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  Nothing collected on this date.
                </p>
              )}
              <ul className="mt-2 divide-y divide-line text-sm">
                {d.byMethod.map((m) => (
                  <li key={m.method} className="flex justify-between py-2">
                    <span>{m.label}</span>
                    <span className="font-semibold">{signed(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink-950">By class</h3>
              {d.byClass.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  Nothing collected on this date.
                </p>
              )}
              <ul className="mt-2 divide-y divide-line text-sm">
                {d.byClass.map((c) => (
                  <li key={c.className} className="flex justify-between py-2">
                    <span>
                      {c.className}
                      <span className="ml-2 text-xs text-slate-500">
                        {c.receipts} receipt{c.receipts === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="font-semibold">{signed(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  {[
                    "Type",
                    "Reference",
                    "Student",
                    "Class",
                    "Method",
                    "Amount",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.lines.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No transactions on this date.
                    </td>
                  </tr>
                )}
                {d.lines.map((l) => (
                  <tr
                    key={`${l.type}-${l.ref}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3">
                      {l.type === "PAYMENT"
                        ? "Payment"
                        : l.type === "REVERSAL"
                          ? "Reversal"
                          : "Refund"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {l.ref}
                    </td>
                    <td className="px-4 py-3">
                      {l.student}
                      <span className="block text-xs text-slate-500">
                        {l.admissionNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">{l.className}</td>
                    <td className="px-4 py-3">{l.methods}</td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 font-semibold ${Number(l.amount) < 0 ? "text-rose-600" : ""}`}
                    >
                      {signed(l.amount)}
                    </td>
                  </tr>
                ))}
                {d.lines.length > 0 && (
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-3" colSpan={5}>
                      Net collection
                    </td>
                    <td className="px-4 py-3">{signed(d.totals.net)}</td>
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

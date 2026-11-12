import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { fmtMoney } from "./shared";

interface Row {
  classId: string;
  className: string;
  invoices: number;
  fees: string;
  discounts: string;
  fines: string;
  totalFee: string;
  collected: string;
  pending: string;
  collectionPct: number;
}
interface Result {
  rows: Row[];
  totals: Omit<Row, "classId" | "className">;
}

const Bar = ({ pct }: { pct: number }) => (
  <div className="flex items-center gap-2">
    <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
    <span className="text-xs font-semibold">{pct}%</span>
  </div>
);

export default function ClassSummaryPage() {
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const params = {
    sessionId: sessionId || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const q = useQuery({
    queryKey: ["reports", "class-fee-summary", params],
    queryFn: async () =>
      (
        await api.get<{ data: Result }>("/reports/class-fee-summary", {
          params,
        })
      ).data.data,
  });

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/reports/class-fee-summary/export",
        params,
        "class-fee-summary.xlsx",
      );
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
        title="Class-wise Fee Summary"
        subtitle="Invoiced, collected and pending fees per class. Cancelled invoices are excluded."
        actions={
          <div className="no-print flex gap-2">
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

      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Session">
          <select
            className="input mt-1.5 font-normal"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">All sessions</option>
            {user?.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From month">
          <input
            type="month"
            className="input mt-1.5 font-normal"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To month">
          <input
            type="month"
            className="input mt-1.5 font-normal"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>

      {d && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total fee", d.totals.totalFee],
            ["Collected", d.totals.collected],
            ["Pending", d.totals.pending],
          ].map(([l, v]) => (
            <div key={l} className="card p-4">
              <p className="text-xs font-semibold text-slate-500">{l}</p>
              <p className="mt-1 text-xl font-extrabold text-ink-950">
                {fmtMoney(v)}
              </p>
            </div>
          ))}
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500">
              Collection rate
            </p>
            <p className="mt-1 text-xl font-extrabold text-emerald-600">
              {d.totals.collectionPct}%
            </p>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Class",
                "Invoices",
                "Fees",
                "Discounts",
                "Fines",
                "Total fee",
                "Collected",
                "Pending",
                "Collection",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {q.isError && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(q.error, "Could not load the report")}
                </td>
              </tr>
            )}
            {d?.rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No invoices in this period yet.
                </td>
              </tr>
            )}
            {d?.rows.map((r) => (
              <tr
                key={r.classId}
                className="border-b border-line last:border-0"
              >
                <td className="px-4 py-3 font-semibold">{r.className}</td>
                <td className="px-4 py-3">{r.invoices}</td>
                <td className="px-4 py-3">{fmtMoney(r.fees)}</td>
                <td className="px-4 py-3">
                  {Number(r.discounts) ? `-${fmtMoney(r.discounts)}` : "—"}
                </td>
                <td className="px-4 py-3">{fmtMoney(r.fines)}</td>
                <td className="px-4 py-3 font-semibold">
                  {fmtMoney(r.totalFee)}
                </td>
                <td className="px-4 py-3">{fmtMoney(r.collected)}</td>
                <td className="px-4 py-3 font-semibold text-rose-600">
                  {fmtMoney(r.pending)}
                </td>
                <td className="px-4 py-3">
                  <Bar pct={r.collectionPct} />
                </td>
              </tr>
            ))}
            {d && d.rows.length > 0 && (
              <tr className="bg-slate-50 font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3">{d.totals.invoices}</td>
                <td className="px-4 py-3">{fmtMoney(d.totals.fees)}</td>
                <td className="px-4 py-3">
                  {Number(d.totals.discounts)
                    ? `-${fmtMoney(d.totals.discounts)}`
                    : "—"}
                </td>
                <td className="px-4 py-3">{fmtMoney(d.totals.fines)}</td>
                <td className="px-4 py-3">{fmtMoney(d.totals.totalFee)}</td>
                <td className="px-4 py-3">{fmtMoney(d.totals.collected)}</td>
                <td className="px-4 py-3 text-rose-600">
                  {fmtMoney(d.totals.pending)}
                </td>
                <td className="px-4 py-3">
                  <Bar pct={d.totals.collectionPct} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="no-print mt-3 text-xs text-slate-500">
        "Collected" is money applied to these invoices. Advance payments not yet
        applied to an invoice are not included here.
      </p>
    </>
  );
}

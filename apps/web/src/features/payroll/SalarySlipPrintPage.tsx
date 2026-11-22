import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, apiMessage } from "@/lib/api";
import { SalarySlipView, SlipsData } from "./SalarySlipView";
import { monthName } from "./shared";

export default function SalarySlipPrintPage() {
  const [p] = useSearchParams();
  const period = p.get("period") ?? "";
  const payrollId = p.get("payrollId") ?? undefined;
  const q = useQuery({
    queryKey: ["payroll", "slips", "print", period, payrollId],
    enabled: !!period,
    queryFn: async () =>
      (
        await api.get<{ data: SlipsData }>("/payroll/slips", {
          params: { period, payrollId },
        })
      ).data.data,
  });
  const d = q.data;

  if (!period)
    return (
      <p className="p-8 text-center text-sm text-slate-600">
        This link is missing the month.
      </p>
    );
  if (q.isLoading)
    return <Loader2 className="mx-auto mt-20 animate-spin text-slate-400" />;
  if (q.isError)
    return (
      <p className="p-8 text-center text-sm text-rose-600">
        {apiMessage(q.error, "Could not load the salary slips")}
      </p>
    );
  if (!d) return null;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          <strong>{d.slips.length}</strong> salary slip
          {d.slips.length === 1 ? "" : "s"} · {monthName(period)}. Choose{" "}
          <strong>Save as PDF</strong> as the printer to get a PDF file.
        </p>
        <button
          className="btn-primary"
          onClick={() => window.print()}
          disabled={d.slips.length === 0}
        >
          <Printer size={16} />
          Print / Save as PDF
        </button>
      </div>
      <div className="space-y-6 p-4 print:space-y-0 print:p-0">
        {d.slips.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            No approved salary slips for this month.
          </p>
        )}
        {d.slips.map((s) => (
          <SalarySlipView key={s.id} data={d} slip={s} />
        ))}
      </div>
    </div>
  );
}

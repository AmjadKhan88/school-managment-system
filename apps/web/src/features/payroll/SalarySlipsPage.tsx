import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2, Printer, X } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { thisMonth } from "@/features/finance/shared";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { SalarySlipView, SlipsData } from "./SalarySlipView";
import { money, monthName, RunsData } from "./shared";

export default function SalarySlipsPage() {
  const can = useAuth((s) => s.can);
  const [period, setPeriod] = useState(thisMonth());
  const [preview, setPreview] = useState<string | null>(null);

  const runs = useQuery({
    queryKey: ["payroll", "runs", period],
    queryFn: async () =>
      (
        await api.get<{ data: RunsData }>("/payroll/runs", {
          params: { period },
        })
      ).data.data,
  });
  const rows = (runs.data?.items ?? []).filter((r) => r.status === "APPROVED");
  const slip = useQuery({
    queryKey: ["payroll", "slips", "preview", period, preview],
    enabled: !!preview,
    queryFn: async () =>
      (
        await api.get<{ data: SlipsData }>("/payroll/slips", {
          params: { period, payrollId: preview },
        })
      ).data.data,
  });

  const open = (payrollId?: string) => {
    const u = new URLSearchParams({ period });
    if (payrollId) u.set("payrollId", payrollId);
    window.open(`/print/salary-slips?${u.toString()}`, "_blank", "noopener");
  };

  return (
    <>
      <PageHeader
        title="Salary Slips"
        subtitle="Slips are available once a month's payroll is approved. Print one, or the whole month as a PDF."
        actions={
          can("payroll", "PRINT") && (
            <button
              className="btn-primary"
              onClick={() => open()}
              disabled={rows.length === 0}
            >
              <Printer size={16} />
              Print all ({rows.length})
            </button>
          )
        }
      />
      <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Month">
          <input
            type="month"
            className="input mt-1.5 font-normal"
            max={thisMonth()}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Slip</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3 text-right">Net salary</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {runs.data && rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No approved payroll for {monthName(period)} yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-semibold">{r.slipNo}</td>
                <td className="px-4 py-3">
                  {r.employee.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.employee.employeeNo} · {r.employee.designation}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {money(r.net)}
                </td>
                <td className="px-4 py-3 text-right">{money(r.balance)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                      onClick={() => setPreview(r.id)}
                      aria-label={`Preview slip of ${r.employee.fullName}`}
                    >
                      <Eye size={16} />
                    </button>
                    {can("payroll", "PRINT") && (
                      <button
                        className="rounded-md p-2 text-brand-700 hover:bg-brand-50"
                        onClick={() => open(r.id)}
                        aria-label={`Print slip of ${r.employee.fullName}`}
                      >
                        <Printer size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto max-w-[220mm]">
            <div className="mb-2 flex justify-end gap-2">
              {can("payroll", "PRINT") && (
                <button className="btn-primary" onClick={() => open(preview)}>
                  <Printer size={16} />
                  Print
                </button>
              )}
              <button
                className="btn border border-white/40 bg-white"
                onClick={() => setPreview(null)}
              >
                <X size={16} />
                Close
              </button>
            </div>
            {slip.isLoading && (
              <Loader2 className="mx-auto mt-10 animate-spin text-white" />
            )}
            {slip.isError && (
              <p className="rounded-xl bg-white p-4 text-sm text-rose-600">
                {apiMessage(slip.error, "Could not load the slip")}
              </p>
            )}
            {slip.data?.slips[0] && (
              <SalarySlipView
                data={slip.data}
                slip={slip.data.slips[0]}
                className="shadow-lift"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

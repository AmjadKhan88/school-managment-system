import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportData, ReportTable } from "@/features/attendance/ReportTable";
import { localToday, thisMonth } from "@/features/finance/shared";
import { Field } from "@/features/students/shared";
import { useDepartments } from "@/features/staff/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { PAY_METHODS } from "./shared";

type RType = "register" | "payments" | "loans";
const TABS: [RType, string][] = [
  ["register", "Payroll register"],
  ["payments", "Salary payments"],
  ["loans", "Loans and advances"],
];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

export default function PayrollReportsPage() {
  const can = useAuth((s) => s.can);
  const [type, setType] = useState<RType>("register");
  const [period, setPeriod] = useState(thisMonth());
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(localToday());
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [exporting, setExporting] = useState(false);
  const departments = useDepartments();

  const params: Record<string, unknown> = {
    departmentId: departmentId || undefined,
    ...(type === "register"
      ? { period }
      : type === "payments"
        ? { from, to, method: method || undefined }
        : { status: status || undefined }),
  };
  const q = useQuery({
    queryKey: ["payroll", "report", type, params],
    queryFn: async () =>
      (
        await api.get<{ data: ReportData }>(`/payroll-reports/${type}`, {
          params,
        })
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/payroll-reports/${type}/export`,
        params,
        `payroll-${type}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Payroll Reports"
        subtitle="Reports use the recorded payroll, payments and loans."
        actions={
          <div className="no-print flex gap-2">
            <button
              className="btn border border-slate-300"
              onClick={() => window.print()}
              disabled={!q.data}
            >
              <Printer size={16} />
              Print
            </button>
            {can("payroll", "EXPORT") && (
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

      <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setType(k)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
              type === k
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {type === "register" && (
          <Field label="Month">
            <input
              type="month"
              className="input mt-1.5 font-normal"
              max={thisMonth()}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
        )}
        {type === "payments" && (
          <>
            <Field label="From">
              <input
                type="date"
                className="input mt-1.5 font-normal"
                max={to}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className="input mt-1.5 font-normal"
                min={from}
                max={localToday()}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="Method">
              <select
                className="input mt-1.5 font-normal"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="">All methods</option>
                {PAY_METHODS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {type === "loans" && (
          <Field label="Status">
            <select
              className="input mt-1.5 font-normal"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Pending and active</option>
              <option value="SETTLED">Settled</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </Field>
        )}
        <Field label="Department">
          <select
            className="input mt-1.5 font-normal"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {q.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load the report")}
        </div>
      )}
      {q.data && (
        <>
          <h2 className="mb-2 hidden text-base font-bold print:block">
            {q.data.title}
          </h2>
          <ReportTable data={q.data} />
          {q.data.note && (
            <p className="no-print mt-3 text-xs text-slate-500">
              {q.data.note}
            </p>
          )}
        </>
      )}
    </>
  );
}

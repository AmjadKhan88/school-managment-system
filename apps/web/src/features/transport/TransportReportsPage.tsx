import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportData, ReportTable } from "@/features/attendance/ReportTable";
import { localToday } from "@/features/finance/shared";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { useRoutes, useVehicles } from "./shared";

type RType =
  | "roster"
  | "utilization"
  | "fees"
  | "attendance"
  | "maintenance"
  | "expiry";
const TABS: [RType, string][] = [
  ["roster", "Roster"],
  ["utilization", "Vehicle use"],
  ["fees", "Fees"],
  ["attendance", "Boarding"],
  ["maintenance", "Maintenance"],
  ["expiry", "Documents"],
];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

export default function TransportReportsPage() {
  const can = useAuth((s) => s.can);
  const [type, setType] = useState<RType>("roster");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(localToday());
  const [routeId, setRouteId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [exporting, setExporting] = useState(false);
  const routes = useRoutes();
  const vehicles = useVehicles();

  const ranged = type === "attendance" || type === "maintenance";
  const params: Record<string, unknown> = {
    ...(ranged ? { from, to } : {}),
    routeId: ["roster", "fees", "attendance"].includes(type)
      ? routeId || undefined
      : undefined,
    vehicleId: type === "maintenance" ? vehicleId || undefined : undefined,
  };
  const q = useQuery({
    queryKey: ["transport", "report", type, params],
    queryFn: async () =>
      (
        await api.get<{ data: ReportData }>(`/transport/reports/${type}`, {
          params,
        })
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/transport/reports/${type}/export`,
        params,
        `transport-${type}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };
  const filters = ranged || ["roster", "fees"].includes(type);

  return (
    <>
      <PageHeader
        title="Transport Reports"
        subtitle="Reports use the recorded assignments, boarding and maintenance."
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
            {can("transport", "EXPORT") && (
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
        {TABS.map(([k, l]) => (
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
            {l}
          </button>
        ))}
      </div>

      {filters && (
        <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {ranged && (
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
            </>
          )}
          {["roster", "fees", "attendance"].includes(type) && (
            <Field label="Route">
              <select
                className="input mt-1.5 font-normal"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
              >
                <option value="">All routes</option>
                {routes.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {type === "maintenance" && (
            <Field label="Vehicle">
              <select
                className="input mt-1.5 font-normal"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">All vehicles</option>
                {vehicles.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vehicleNo}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}

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

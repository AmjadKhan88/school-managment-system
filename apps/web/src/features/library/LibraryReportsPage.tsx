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
import { useCategories } from "./shared";

type RType =
  | "register"
  | "overdue"
  | "fines"
  | "popular"
  | "lost"
  | "inventory";
const TABS: [RType, string][] = [
  ["register", "Issue register"],
  ["overdue", "Overdue"],
  ["fines", "Fines"],
  ["popular", "Most borrowed"],
  ["lost", "Lost and withdrawn"],
  ["inventory", "Inventory"],
];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

export default function LibraryReportsPage() {
  const can = useAuth((s) => s.can);
  const [type, setType] = useState<RType>("register");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(localToday());
  const [borrowerType, setBorrowerType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [issueStatus, setIssueStatus] = useState("");
  const [fineStatus, setFineStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const categories = useCategories();

  const ranged = type === "register" || type === "fines" || type === "popular";
  const params: Record<string, unknown> = {
    ...(ranged ? { from, to } : {}),
    borrowerType: ["register", "fines", "popular"].includes(type)
      ? borrowerType || undefined
      : undefined,
    categoryId: ["register", "popular", "lost", "inventory"].includes(type)
      ? categoryId || undefined
      : undefined,
    issueStatus: type === "register" ? issueStatus || undefined : undefined,
    fineStatus: type === "fines" ? fineStatus || undefined : undefined,
  };
  const q = useQuery({
    queryKey: ["library", "report", type, params],
    queryFn: async () =>
      (
        await api.get<{ data: ReportData }>(`/library/reports/${type}`, {
          params,
        })
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/library/reports/${type}/export`,
        params,
        `library-${type}.xlsx`,
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
        title="Library Reports"
        subtitle="Reports use the recorded issues, fines and copies."
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
            {can("library", "EXPORT") && (
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

      {type !== "overdue" && (
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
          {["register", "fines", "popular"].includes(type) && (
            <Field label="Borrowers">
              <select
                className="input mt-1.5 font-normal"
                value={borrowerType}
                onChange={(e) => setBorrowerType(e.target.value)}
              >
                <option value="">Students and staff</option>
                <option value="STUDENT">Students</option>
                <option value="EMPLOYEE">Staff</option>
              </select>
            </Field>
          )}
          {["register", "popular", "lost", "inventory"].includes(type) && (
            <Field label="Category">
              <select
                className="input mt-1.5 font-normal"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {type === "register" && (
            <Field label="Status">
              <select
                className="input mt-1.5 font-normal"
                value={issueStatus}
                onChange={(e) => setIssueStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="ISSUED">Out</option>
                <option value="RETURNED">Returned</option>
                <option value="LOST">Lost</option>
              </select>
            </Field>
          )}
          {type === "fines" && (
            <Field label="Fine status">
              <select
                className="input mt-1.5 font-normal"
                value={fineStatus}
                onChange={(e) => setFineStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
                <option value="WAIVED">Waived</option>
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

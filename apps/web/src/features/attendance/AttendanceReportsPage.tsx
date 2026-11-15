import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday, thisMonth } from "@/features/finance/shared";
import { Field, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { LETTER_STYLE } from "./shared";

type Tab = "daily" | "monthly" | "absentees" | "late" | "low";
const TABS: [Tab, string][] = [
  ["daily", "Daily summary"],
  ["monthly", "Monthly register"],
  ["absentees", "Absent students"],
  ["late", "Late arrivals"],
  ["low", "Low attendance"],
];

interface Col {
  key: string;
  header: string;
  kind?: "status" | "percent";
}
interface Report {
  title: string;
  columns: Col[];
  rows: Record<string, string | number | null>[];
  note?: string;
}
interface SectionOption {
  id: string;
  name: string;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

function Cell({ col, value }: { col: Col; value: string | number | null }) {
  if (value === null || value === "") return null;
  if (col.kind === "status")
    return (
      <span
        className={cn(
          "inline-block min-w-[1.4rem] rounded px-1 text-center text-xs font-bold",
          LETTER_STYLE[String(value)],
        )}
      >
        {value}
      </span>
    );
  if (col.kind === "percent") {
    const n = Number(value);
    return (
      <span
        className={cn(
          "font-semibold",
          n < 75
            ? "text-rose-600"
            : n < 90
              ? "text-amber-600"
              : "text-emerald-600",
        )}
      >
        {n}%
      </span>
    );
  }
  return <>{value}</>;
}

export default function AttendanceReportsPage({
  initial = "daily",
}: {
  initial?: Tab;
}) {
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();

  const [tab, setTab] = useState<Tab>(initial);
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(localToday());
  const [month, setMonth] = useState(thisMonth());
  const [from, setFrom] = useState(daysAgo(tab === "low" ? 29 : 6));
  const [to, setTo] = useState(localToday());
  const [threshold, setThreshold] = useState("75");
  const [exporting, setExporting] = useState(false);

  const classes = useClasses();
  const sections = useQuery({
    queryKey: ["/academics/sections", classId],
    enabled: !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: SectionOption[] }>("/academics/sections", {
          params: { classId },
        })
      ).data.data,
  });

  const base = { sessionId: sessionId || undefined };
  const params: Record<string, unknown> =
    tab === "daily"
      ? { ...base, date }
      : tab === "monthly"
        ? {
            ...base,
            classId: classId || undefined,
            sectionId: sectionId || undefined,
            month,
          }
        : tab === "low"
          ? { ...base, classId: classId || undefined, from, to, threshold }
          : {
              ...base,
              classId: classId || undefined,
              sectionId: sectionId || undefined,
              from,
              to,
            };
  const needsClass = tab === "monthly" && !classId;

  const q = useQuery({
    queryKey: ["attendance", "report", tab, params],
    enabled: !needsClass,
    queryFn: async () =>
      (
        await api.get<{ data: Report }>(`/attendance/reports/${tab}`, {
          params,
        })
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/attendance/reports/${tab}/export`,
        params,
        `attendance-${tab}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const d = q.data;
  const showClass = tab !== "daily";
  const showSection =
    tab === "monthly" || tab === "absentees" || tab === "late";
  const tight = tab === "monthly";

  return (
    <>
      <PageHeader
        title="Attendance Reports"
        subtitle="Daily, monthly, absent, late and low-attendance reports. Print or export to Excel."
        actions={
          <div className="no-print flex gap-2">
            <button
              className="btn border border-slate-300"
              onClick={() => window.print()}
              disabled={!d}
            >
              <Printer size={16} />
              Print
            </button>
            {can("attendance", "EXPORT") && (
              <button
                className="btn-primary"
                onClick={exportXlsx}
                disabled={exporting || needsClass}
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
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
              tab === k
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Session">
          <select
            className="input mt-1.5 font-normal"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Active session</option>
            {user?.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {showClass && (
          <Field label={tab === "monthly" ? "Class *" : "Class"}>
            <select
              className="input mt-1.5 font-normal"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId("");
              }}
            >
              <option value="">
                {tab === "monthly" ? "Select…" : "All classes"}
              </option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {showSection && (
          <Field label="Section">
            <select
              className="input mt-1.5 font-normal"
              disabled={!classId}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">All sections</option>
              {sections.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {tab === "daily" && (
          <Field label="Date">
            <input
              type="date"
              className="input mt-1.5 font-normal"
              max={localToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        )}
        {tab === "monthly" && (
          <Field label="Month">
            <input
              type="month"
              className="input mt-1.5 font-normal"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
        )}
        {(tab === "absentees" || tab === "late" || tab === "low") && (
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
        {tab === "low" && (
          <Field label="Below (%)">
            <input
              type="number"
              min="1"
              max="100"
              className="input mt-1.5 font-normal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
        )}
      </div>

      {needsClass && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a class to see its monthly register.
        </div>
      )}
      {!needsClass && q.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load the report")}
        </div>
      )}

      {d && !needsClass && (
        <>
          <h2 className="mb-2 hidden text-base font-bold print:block">
            {d.title}
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  {d.columns.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap py-3",
                        tight && c.kind === "status"
                          ? "px-1 text-center"
                          : "px-3",
                      )}
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={d.columns.length}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      Nothing to show for these filters.
                    </td>
                  </tr>
                )}
                {d.rows.map((r, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-line last:border-0",
                      r.class === "Total" && "bg-slate-50 font-bold",
                    )}
                  >
                    {d.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap py-2",
                          tight && c.kind === "status"
                            ? "px-1 text-center"
                            : "px-3",
                        )}
                      >
                        <Cell col={c} value={r[c.key] ?? null} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.note && (
            <p className="no-print mt-3 text-xs text-slate-500">{d.note}</p>
          )}
        </>
      )}
    </>
  );
}

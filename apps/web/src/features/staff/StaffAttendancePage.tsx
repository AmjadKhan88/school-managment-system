import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Info, Loader2, Printer, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportData, ReportTable } from "@/features/attendance/ReportTable";
import {
  Status,
  STATUS_META,
  STATUS_ORDER,
} from "@/features/attendance/shared";
import { localToday, thisMonth } from "@/features/finance/shared";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { useDepartments } from "./shared";

type Group = "teachers" | "staff";
interface Emp {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  designation: string;
  department: string | null;
  status: Status | null;
  checkIn: string | null;
  checkOut: string | null;
  markedBy: string | null;
  leave: {
    applicationNo: string;
    type: string;
    status: "APPROVED" | "PENDING";
  } | null;
}
interface Register {
  date: string;
  taken: boolean;
  employees: Emp[];
}
interface Mark {
  status: Status;
  checkIn: string;
  checkOut: string;
}

const initial = (e: Emp): Mark => ({
  status: e.status ?? (e.leave?.status === "APPROVED" ? "LEAVE" : "PRESENT"),
  checkIn: e.checkIn ?? "",
  checkOut: e.checkOut ?? "",
});
const attended = (s: Status) =>
  s === "PRESENT" || s === "LATE" || s === "HALF_DAY";
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

export default function StaffAttendancePage({ group }: { group: Group }) {
  const [tab, setTab] = useState<"register" | "reports">("register");
  const title =
    group === "teachers" ? "Teacher Attendance" : "Staff Attendance";
  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          group === "teachers"
            ? "Daily attendance of teaching staff, and staff attendance reports."
            : "Daily attendance of non-teaching staff, and staff attendance reports."
        }
      />
      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ["register", "Daily register"],
            ["reports", "Reports"],
          ] as const
        ).map(([k, label]) => (
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
      {tab === "register" ? (
        <RegisterTab group={group} />
      ) : (
        <ReportsTab group={group} />
      )}
    </>
  );
}

function RegisterTab({ group }: { group: Group }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [date, setDate] = useState(localToday());
  const [departmentId, setDepartmentId] = useState("");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const departments = useDepartments();

  const reg = useQuery({
    queryKey: ["staff-attendance", "register", group, date, departmentId],
    queryFn: async () =>
      (
        await api.get<{ data: Register }>("/staff-attendance/register", {
          params: { date, group, departmentId: departmentId || undefined },
        })
      ).data.data,
  });
  const data = reg.data;
  useEffect(() => {
    if (data)
      setMarks(
        Object.fromEntries(
          data.employees.map((e) => [e.employeeId, initial(e)]),
        ),
      );
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      LEAVE: 0,
      HALF_DAY: 0,
    };
    Object.values(marks).forEach((m) => {
      c[m.status]++;
    });
    return c;
  }, [marks]);
  const dirty =
    !!data &&
    (!data.taken ||
      data.employees.some(
        (e) =>
          JSON.stringify(initial(e)) !== JSON.stringify(marks[e.employeeId]),
      ));
  const markedBy = data?.employees.find((e) => e.markedBy)?.markedBy;
  const canMark = can("attendance", "CREATE") && can("staff", "EDIT");
  const set = (id: string, patch: Partial<Mark>) =>
    setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const save = useMutation({
    mutationFn: () =>
      api.put<{ data: { created: number; updated: number } }>(
        "/staff-attendance/register",
        {
          date,
          group,
          entries: data!.employees.map((e) => {
            const m = marks[e.employeeId];
            return {
              employeeId: e.employeeId,
              status: m.status,
              checkIn: attended(m.status) ? m.checkIn || undefined : undefined,
              checkOut: attended(m.status)
                ? m.checkOut || undefined
                : undefined,
            };
          }),
        },
      ),
    onSuccess: (res) => {
      const r = res.data.data;
      toast.success(
        r.created + r.updated === 0
          ? "No changes to save"
          : `Attendance saved: ${r.created} recorded, ${r.updated} changed`,
      );
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const timeBad = (m?: Mark) =>
    !!m &&
    attended(m.status) &&
    !!m.checkIn &&
    !!m.checkOut &&
    m.checkOut <= m.checkIn;
  const invalid = Object.values(marks).filter(timeBad).length;

  return (
    <>
      <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Date">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            max={localToday()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
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

      {reg.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {reg.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(reg.error, "Could not load the register")}
        </div>
      )}

      {data && (
        <>
          <div
            className={cn(
              "mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm",
              data.taken
                ? "border-sky-200 bg-sky-50 text-sky-900"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              {data.taken
                ? `Attendance for this date was already saved${markedBy ? ` by ${markedBy}` : ""}. Changing it needs the edit permission.`
                : "Attendance has not been taken for this date. Everyone starts as present. Nothing is saved until you press Save."}
            </span>
          </div>

          {data.employees.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              No {group === "teachers" ? "teachers" : "staff"} on the register
              for this date.
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {STATUS_ORDER.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {STATUS_META[s].label}: {counts[s]}
                  </span>
                ))}
                {canMark && (
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="btn border border-emerald-600 py-1.5 text-emerald-700"
                      onClick={() =>
                        setMarks(
                          Object.fromEntries(
                            data.employees.map((e) => [
                              e.employeeId,
                              {
                                ...marks[e.employeeId],
                                status: "PRESENT" as Status,
                              },
                            ]),
                          ),
                        )
                      }
                    >
                      All present
                    </button>
                  </span>
                )}
              </div>

              <fieldset disabled={!canMark} className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Employee</th>
                      <th className="px-3 py-3">Attendance</th>
                      <th className="px-3 py-3">Check-in</th>
                      <th className="px-3 py-3">Check-out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((e) => {
                      const m = marks[e.employeeId];
                      if (!m) return null;
                      return (
                        <tr
                          key={e.employeeId}
                          className="border-b border-line last:border-0"
                        >
                          <td className="px-3 py-2.5">
                            {e.fullName}
                            <span className="block text-xs text-slate-500">
                              {e.employeeNo} · {e.designation}
                              {e.department ? ` · ${e.department}` : ""}
                            </span>
                            {e.leave && (
                              <span
                                className={cn(
                                  "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  e.leave.status === "APPROVED"
                                    ? "bg-sky-100 text-sky-700"
                                    : "bg-amber-100 text-amber-700",
                                )}
                              >
                                {e.leave.status === "APPROVED"
                                  ? `On approved leave (${e.leave.applicationNo})`
                                  : `Leave pending (${e.leave.applicationNo})`}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div
                              role="group"
                              aria-label={`Attendance for ${e.fullName}`}
                              className="flex flex-wrap gap-1"
                            >
                              {STATUS_ORDER.map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  aria-pressed={m.status === st}
                                  title={STATUS_META[st].label}
                                  onClick={() =>
                                    set(e.employeeId, { status: st })
                                  }
                                  className={cn(
                                    "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition",
                                    m.status === st
                                      ? STATUS_META[st].active
                                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                  )}
                                >
                                  {STATUS_META[st].letter}
                                  <span className="hidden font-semibold lg:inline">
                                    {" "}
                                    {STATUS_META[st].label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              disabled={!attended(m.status)}
                              className="input w-28 py-1.5"
                              value={m.checkIn}
                              onChange={(ev) =>
                                set(e.employeeId, { checkIn: ev.target.value })
                              }
                              aria-label={`${e.fullName} check-in`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              disabled={!attended(m.status)}
                              className={cn(
                                "input w-28 py-1.5",
                                timeBad(m) && "border-rose-400",
                              )}
                              value={m.checkOut}
                              onChange={(ev) =>
                                set(e.employeeId, { checkOut: ev.target.value })
                              }
                              aria-label={`${e.fullName} check-out`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </fieldset>

              {canMark && (
                <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <p className="text-sm text-slate-600">
                    {invalid > 0
                      ? "Check-out must be after check-in."
                      : dirty
                        ? "You have unsaved changes."
                        : "Everything is saved."}
                  </p>
                  <button
                    className="btn-primary px-6"
                    disabled={!dirty || invalid > 0 || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save attendance
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

type RType = "daily" | "monthly" | "absentees" | "late";
const RTABS: [RType, string][] = [
  ["daily", "Daily summary"],
  ["monthly", "Monthly register"],
  ["absentees", "Absent staff"],
  ["late", "Late arrivals"],
];

function ReportsTab({ group: pageGroup }: { group: Group }) {
  const can = useAuth((s) => s.can);
  const [type, setType] = useState<RType>("daily");
  const [group, setGroup] = useState<string>(pageGroup);
  const [departmentId, setDepartmentId] = useState("");
  const [date, setDate] = useState(localToday());
  const [month, setMonth] = useState(thisMonth());
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(localToday());
  const [exporting, setExporting] = useState(false);
  const departments = useDepartments();

  const params: Record<string, unknown> = {
    group: group || undefined,
    departmentId: departmentId || undefined,
    ...(type === "daily"
      ? { date }
      : type === "monthly"
        ? { month }
        : { from, to }),
  };
  const q = useQuery({
    queryKey: ["staff-attendance", "report", type, params],
    queryFn: async () =>
      (
        await api.get<{ data: ReportData }>(
          `/staff-attendance/reports/${type}`,
          { params },
        )
      ).data.data,
  });
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/staff-attendance/reports/${type}/export`,
        params,
        `staff-attendance-${type}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 border-b border-line">
          {RTABS.map(([k, label]) => (
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
        <div className="flex gap-2">
          <button
            className="btn border border-slate-300"
            onClick={() => window.print()}
            disabled={!q.data}
          >
            <Printer size={16} />
            Print
          </button>
          {can("attendance", "EXPORT") && (
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
      </div>

      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Group">
          <select
            className="input mt-1.5 font-normal"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">Teachers and staff</option>
            <option value="teachers">Teachers</option>
            <option value="staff">Other staff</option>
          </select>
        </Field>
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
        {type === "daily" && (
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
        {type === "monthly" && (
          <Field label="Month">
            <input
              type="month"
              className="input mt-1.5 font-normal"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
        )}
        {(type === "absentees" || type === "late") && (
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
          <ReportTable data={q.data} tight={type === "monthly"} />
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

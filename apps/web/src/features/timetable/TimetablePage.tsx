import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { useMyScope } from "@/features/staff/shared";
import { Field, fmtDate, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  DAY_NAMES,
  LEAVE_LABEL,
  Period,
  Room,
  Setup,
  useSetup,
} from "./shared";
import { TimetableGrid } from "./TimetableGrid";

type Tab = "class" | "teacher" | "cover" | "setup";
const conflictsOf = (e: unknown): string[] =>
  (e as AxiosError<{ errors?: { conflicts?: string[] } }>)?.response?.data
    ?.errors?.conflicts ?? [];
const openPrint = (params: Record<string, string>) =>
  window.open(
    `/print/timetable?${new URLSearchParams(params).toString()}`,
    "_blank",
    "noopener",
  );

export default function TimetablePage() {
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [tab, setTab] = useState<Tab>("class");
  const canCover = can("timetable", "EDIT") || can("staff", "VIEW");
  const tabs: [Tab, string][] = [
    ["class", "Class timetable"],
    ["teacher", "Teacher timetable"],
    ...(canCover ? ([["cover", "Cover needed"]] as [Tab, string][]) : []),
    ...(can("timetable", "EDIT")
      ? ([["setup", "Setup"]] as [Tab, string][])
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle="Weekly timetable by class and by teacher. A teacher or a room cannot be in two places in the same period."
        actions={
          <select
            className="input w-40 font-semibold"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            aria-label="Session"
          >
            <option value="">Session…</option>
            {user?.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      />
      <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([k, label]) => (
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
      {!sessionId ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a session.
        </div>
      ) : (
        <>
          {tab === "class" && <ClassTab sessionId={sessionId} />}
          {tab === "teacher" && <TeacherTab sessionId={sessionId} />}
          {tab === "cover" && canCover && <CoverTab sessionId={sessionId} />}
          {tab === "setup" && <SetupTab sessionId={sessionId} />}
        </>
      )}
    </>
  );
}

// =========================== Class timetable ===========================
interface SectionOpt {
  id: string;
  name: string;
  isActive: boolean;
}
interface ClassEntry {
  id: string;
  dayOfWeek: number;
  periodId: string;
  subject: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  room: { id: string; name: string } | null;
  leave: { applicationNo: string; type: string } | null;
}
interface ClassGridData {
  section: { id: string; name: string; classId: string; className: string };
  days: { day: number; date: string }[];
  periods: Period[];
  entries: ClassEntry[];
}

function ClassTab({ sessionId }: { sessionId: string }) {
  const can = useAuth((s) => s.can);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [weekOf, setWeekOf] = useState(localToday());
  const [edit, setEdit] = useState<{
    day: number;
    period: Period;
    entry: ClassEntry | null;
  } | null>(null);

  const classes = useClasses();
  const sections = useQuery({
    queryKey: ["/academics/sections", classId],
    enabled: !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: SectionOpt[] }>("/academics/sections", {
          params: { classId },
        })
      ).data.data,
  });
  const scope = useMyScope(sessionId);
  const only = scope.data?.restricted ? scope.data : null;
  const mine = only ? [...only.classTeacher, ...only.teaching] : [];
  const classOptions = classes.data?.filter(
    (c) => !only || mine.some((x) => x.classId === c.id),
  );
  const sectionOptions = sections.data?.filter(
    (s) => s.isActive && (!only || mine.some((x) => x.sectionId === s.id)),
  );

  const grid = useQuery({
    queryKey: ["timetable", "class", sessionId, sectionId, weekOf],
    enabled: !!sectionId,
    queryFn: async () =>
      (
        await api.get<{ data: ClassGridData }>("/timetable/class", {
          params: { sessionId, sectionId, weekOf },
        })
      ).data.data,
  });
  const g = grid.data;
  const canFill = can("timetable", "CREATE");
  const find = (day: number, p: Period) =>
    g?.entries.find((e) => e.dayOfWeek === day && e.periodId === p.id) ?? null;

  return (
    <>
      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Class">
          <select
            className="input mt-1.5 font-normal"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">Select…</option>
            {classOptions?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section">
          <select
            className="input mt-1.5 font-normal"
            value={sectionId}
            disabled={!classId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">Select…</option>
            {sectionOptions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Week of">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          />
        </Field>
        <div className="flex items-end gap-2 pb-0.5">
          {can("timetable", "PRINT") && (
            <button
              className="btn border border-slate-300"
              disabled={!sectionId}
              onClick={() => openPrint({ type: "class", sessionId, sectionId })}
            >
              <Printer size={16} />
              Print
            </button>
          )}
          {can("timetable", "PRINT") && !only && (
            <button
              className="btn border border-slate-300"
              disabled={!classId}
              onClick={() => openPrint({ type: "class", sessionId, classId })}
            >
              <Printer size={16} />
              All sections
            </button>
          )}
        </div>
      </div>
      {only && mine.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You are not assigned to any class this session, so there is no
          timetable to show.
        </div>
      )}
      {!sectionId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a class and section.
        </div>
      )}
      {grid.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {grid.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(grid.error, "Could not load the timetable")}
        </div>
      )}
      {g && g.periods.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No periods are set up for this session yet.{" "}
          {can("timetable", "EDIT")
            ? "Add them under Setup."
            : "Ask the timetable manager to set them up."}
        </div>
      )}
      {g && g.periods.length > 0 && (
        <>
          <TimetableGrid
            days={g.days}
            periods={g.periods}
            onCell={
              canFill
                ? (day, p) => setEdit({ day, period: p, entry: find(day, p) })
                : undefined
            }
            cell={(day, p) => {
              const e = find(day, p);
              if (!e)
                return canFill ? (
                  <span className="text-xs text-slate-300">+ add</span>
                ) : null;
              return (
                <div
                  className={cn(
                    "rounded-lg p-1.5",
                    e.leave && "bg-amber-100 ring-1 ring-amber-300",
                  )}
                >
                  <p className="font-semibold">{e.subject.name}</p>
                  <p className="text-xs text-slate-600">
                    {e.teacher?.name ?? (
                      <span className="text-amber-600">No teacher</span>
                    )}
                  </p>
                  {e.room && (
                    <p className="text-[11px] text-slate-400">
                      Room {e.room.name}
                    </p>
                  )}
                  {e.leave && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle size={11} />
                      Teacher on leave ({e.leave.applicationNo})
                    </p>
                  )}
                </div>
              );
            }}
          />
          <p className="no-print mt-3 text-xs text-slate-500">
            Amber cells have a teacher on approved leave in the chosen week.
            They need someone to cover.
          </p>
        </>
      )}
      {edit && g && (
        <EntryDialog
          sessionId={sessionId}
          section={g.section}
          day={edit.day}
          period={edit.period}
          entry={edit.entry}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

interface Options {
  subjects: { id: string; name: string }[];
  assigned: Record<string, string>;
  teachers: { id: string; employeeNo: string; fullName: string }[];
}

function EntryDialog({
  sessionId,
  section,
  day,
  period,
  entry,
  onClose,
}: {
  sessionId: string;
  section: ClassGridData["section"];
  day: number;
  period: Period;
  entry: ClassEntry | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [subjectId, setSubjectId] = useState(entry?.subject.id ?? "");
  const [employeeId, setEmployeeId] = useState(entry?.teacher?.id ?? "");
  const [roomId, setRoomId] = useState(entry?.room?.id ?? "");
  const [conflicts, setConflicts] = useState<string[]>([]);

  const opts = useQuery({
    queryKey: ["timetable", "options", sessionId, section.id],
    queryFn: async () =>
      (
        await api.get<{ data: Options }>("/timetable/options", {
          params: { sessionId, sectionId: section.id },
        })
      ).data.data,
  });
  const setup = useSetup(sessionId);
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["timetable"] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      api.put("/timetable/entry", {
        sessionId,
        sectionId: section.id,
        dayOfWeek: day,
        periodId: period.id,
        subjectId,
        employeeId: employeeId || null,
        roomId: roomId || null,
      }),
    onSuccess: () => done(entry ? "Slot updated" : "Slot added"),
    onError: (e) => {
      const c = conflictsOf(e);
      setConflicts(c);
      toast.error(
        c.length ? "This slot conflicts. Nothing was saved." : apiMessage(e),
      );
    },
  });
  const clear = useMutation({
    mutationFn: () => api.delete(`/timetable/entry/${entry!.id}`),
    onSuccess: () => done("Slot cleared"),
    onError: (e) => toast.error(apiMessage(e)),
  });

  const pickSubject = (id: string) => {
    setSubjectId(id);
    setConflicts([]);
    if (!entry || id !== entry.subject.id)
      setEmployeeId(opts.data?.assigned[id] ?? "");
  };
  const assignedHere = subjectId ? opts.data?.assigned[subjectId] : undefined;
  const readOnlyChange = !!entry && !can("timetable", "EDIT");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {DAY_NAMES[day - 1]}, {period.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {section.className}, Section {section.name} · {period.startTime} to{" "}
          {period.endTime}
        </p>
        {opts.isLoading && (
          <Loader2 className="mx-auto my-8 animate-spin text-slate-400" />
        )}
        {opts.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(opts.error, "Could not load the options")}
          </p>
        )}
        {opts.data && (
          <fieldset disabled={readOnlyChange} className="mt-4 space-y-4">
            <Field label="Subject *">
              <select
                required
                className="input mt-1.5 font-normal"
                value={subjectId}
                onChange={(e) => pickSubject(e.target.value)}
              >
                <option value="">Select…</option>
                {opts.data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teacher">
              <select
                className="input mt-1.5 font-normal"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setConflicts([]);
                }}
              >
                <option value="">No teacher</option>
                {opts.data.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.employeeNo})
                    {assignedHere === t.id ? " · assigned" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {subjectId && !assignedHere && (
              <p className="-mt-2 text-xs text-amber-700">
                No teacher is assigned to this subject for the section yet
                (Teacher Assignment).
              </p>
            )}
            {subjectId &&
              assignedHere &&
              employeeId &&
              employeeId !== assignedHere && (
                <p className="-mt-2 text-xs text-amber-700">
                  This is not the teacher assigned to this subject.
                </p>
              )}
            <Field label="Room">
              <select
                className="input mt-1.5 font-normal"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  setConflicts([]);
                }}
              >
                <option value="">No room</option>
                {setup.data?.rooms
                  .filter((r: Room) => r.isActive || r.id === roomId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.capacity ? ` (${r.capacity})` : ""}
                    </option>
                  ))}
              </select>
            </Field>
          </fieldset>
        )}
        {conflicts.length > 0 && (
          <div
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            role="alert"
          >
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle size={15} />
              Not saved:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {readOnlyChange && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            This slot is filled. Changing it needs the edit permission.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          {entry && can("timetable", "DELETE") ? (
            <button
              type="button"
              className="btn border border-rose-300 text-rose-600"
              disabled={clear.isPending}
              onClick={() =>
                window.confirm("Clear this slot?") && clear.mutate()
              }
            >
              <Trash2 size={15} />
              Clear
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn border border-slate-300"
              onClick={onClose}
            >
              Cancel
            </button>
            {!readOnlyChange && (
              <button
                className="btn-primary"
                disabled={save.isPending || !subjectId}
              >
                {save.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Save
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// =========================== Teacher timetable ===========================
interface TeacherOpt {
  id: string;
  employeeNo: string;
  fullName: string;
  periods: number;
}
interface TeacherGridData {
  employee: { id: string; name: string; employeeNo: string };
  days: {
    day: number;
    date: string;
    leave: { applicationNo: string; type: string } | null;
  }[];
  periods: Period[];
  weeklyPeriods: number;
  entries: {
    id: string;
    dayOfWeek: number;
    periodId: string;
    subject: { name: string };
    className: string;
    sectionName: string;
    room: { name: string } | null;
  }[];
}

function TeacherTab({ sessionId }: { sessionId: string }) {
  const can = useAuth((s) => s.can);
  const [employeeId, setEmployeeId] = useState("");
  const [weekOf, setWeekOf] = useState(localToday());
  const scope = useMyScope(sessionId);
  const restricted = !!scope.data?.restricted;

  const teachers = useQuery({
    queryKey: ["timetable", "teachers", sessionId],
    enabled: !restricted && scope.isSuccess,
    queryFn: async () =>
      (
        await api.get<{ data: TeacherOpt[] }>("/timetable/teachers", {
          params: { sessionId },
        })
      ).data.data,
  });
  const grid = useQuery({
    queryKey: [
      "timetable",
      "teacher",
      sessionId,
      restricted ? "me" : employeeId,
      weekOf,
    ],
    enabled: scope.isSuccess && (restricted || !!employeeId),
    queryFn: async () =>
      (
        await api.get<{ data: TeacherGridData }>("/timetable/teacher", {
          params: {
            sessionId,
            employeeId: restricted ? undefined : employeeId,
            weekOf,
          },
        })
      ).data.data,
  });
  const g = grid.data;

  return (
    <>
      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {restricted ? (
          <div className="self-end pb-2 text-sm font-semibold">
            Your timetable
          </div>
        ) : (
          <Field label="Teacher">
            <select
              className="input mt-1.5 font-normal"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select…</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.periods} periods)
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Week of">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          />
        </Field>
        <div className="flex items-end gap-2 pb-0.5">
          {can("timetable", "PRINT") && (
            <button
              className="btn border border-slate-300"
              disabled={!restricted && !employeeId}
              onClick={() =>
                openPrint(
                  restricted
                    ? { type: "teacher", sessionId }
                    : { type: "teacher", sessionId, employeeId },
                )
              }
            >
              <Printer size={16} />
              Print
            </button>
          )}
          {can("timetable", "PRINT") && !restricted && (
            <button
              className="btn border border-slate-300"
              onClick={() => openPrint({ type: "teacher", sessionId })}
            >
              <Printer size={16} />
              All teachers
            </button>
          )}
        </div>
      </div>
      {!restricted && !employeeId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a teacher.
        </div>
      )}
      {grid.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {grid.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(grid.error, "Could not load the timetable")}
        </div>
      )}
      {g && (
        <>
          <p className="mb-2 text-sm">
            <strong>{g.employee.name}</strong> ({g.employee.employeeNo}) teaches{" "}
            <strong>{g.weeklyPeriods}</strong> period
            {g.weeklyPeriods === 1 ? "" : "s"} a week.
          </p>
          {g.periods.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              No periods are set up for this session yet.
            </div>
          ) : (
            <TimetableGrid
              days={g.days.map((d) => ({
                day: d.day,
                date: d.date,
                flag: d.leave ? (
                  <span className="mt-0.5 flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle size={11} />
                    On leave · {LEAVE_LABEL[d.leave.type] ?? d.leave.type}
                  </span>
                ) : undefined,
              }))}
              periods={g.periods}
              cell={(day, p) => {
                const e = g.entries.find(
                  (x) => x.dayOfWeek === day && x.periodId === p.id,
                );
                const leave = g.days.find((d) => d.day === day)?.leave;
                if (!e) return null;
                return (
                  <div
                    className={cn(
                      "rounded-lg p-1.5",
                      leave && "bg-amber-100 ring-1 ring-amber-300",
                    )}
                  >
                    <p className="font-semibold">{e.subject.name}</p>
                    <p className="text-xs text-slate-600">
                      {e.className} {e.sectionName}
                    </p>
                    {e.room && (
                      <p className="text-[11px] text-slate-400">
                        Room {e.room.name}
                      </p>
                    )}
                  </div>
                );
              }}
            />
          )}
        </>
      )}
    </>
  );
}

// =========================== Cover needed ===========================
interface CoverRow {
  date: string;
  day: string;
  period: string;
  time: string;
  className: string;
  sectionName: string;
  subject: string;
  teacher: string;
  employeeNo: string;
  applicationNo: string;
}

function CoverTab({ sessionId }: { sessionId: string }) {
  const [from, setFrom] = useState(localToday());
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  });
  const q = useQuery({
    queryKey: ["timetable", "cover", sessionId, from, to],
    enabled: !!from && !!to && to >= from,
    queryFn: async () =>
      (
        await api.get<{ data: CoverRow[] }>("/timetable/cover", {
          params: { sessionId, from, to },
        })
      ).data.data,
  });
  return (
    <>
      <div className="no-print card mb-4 grid gap-4 p-4 sm:grid-cols-3">
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
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <div className="flex items-end pb-0.5">
          <button
            className="btn border border-slate-300"
            onClick={() => window.print()}
            disabled={!q.data?.length}
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load the list")}
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Date",
                "Period",
                "Class",
                "Subject",
                "Teacher on leave",
                "Leave",
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
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {q.data?.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No period needs cover in this range.
                </td>
              </tr>
            )}
            {q.data?.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  {r.day}
                  <span className="block text-xs text-slate-500">
                    {fmtDate(r.date)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.period}
                  <span className="block text-xs text-slate-500">{r.time}</span>
                </td>
                <td className="px-4 py-3">
                  {r.className} {r.sectionName}
                </td>
                <td className="px-4 py-3 font-semibold">{r.subject}</td>
                <td className="px-4 py-3">
                  {r.teacher}
                  <span className="block text-xs text-slate-500">
                    {r.employeeNo}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.applicationNo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="no-print mt-3 text-xs text-slate-500">
        Only approved leave is listed. These periods have no one to teach them
        on those dates. Arrange cover, then tell the class teacher.
      </p>
    </>
  );
}

// =========================== Setup ===========================
function SetupTab({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const setup = useSetup(sessionId);
  const [period, setPeriod] = useState<Period | "new" | null>(null);
  const [room, setRoom] = useState<Room | "new" | null>(null);
  const [days, setDays] = useState<number[] | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["timetable"] });
  const s = setup.data;
  const workingDays = days ?? s?.workingDays ?? [];

  const saveDays = useMutation({
    mutationFn: () => api.put("/timetable/config", { sessionId, workingDays }),
    onSuccess: () => {
      toast.success("Working days saved");
      setDays(null);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const defaults = useMutation({
    mutationFn: () => api.post("/timetable/periods/defaults", { sessionId }),
    onSuccess: () => {
      toast.success("Standard periods added. Adjust the times to suit.");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const delPeriod = useMutation({
    mutationFn: (id: string) => api.delete(`/timetable/periods/${id}`),
    onSuccess: () => {
      toast.success("Period deleted");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const delRoom = useMutation({
    mutationFn: (id: string) => api.delete(`/timetable/rooms/${id}`),
    onSuccess: () => {
      toast.success("Room deleted");
      refresh();
    },
    onError: (e) =>
      toast.error(apiMessage(e, "This room is used in the timetable")),
  });

  if (setup.isLoading)
    return <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />;
  if (!s)
    return (
      <div className="card p-6 text-center text-sm text-rose-600">
        {apiMessage(setup.error, "Could not load the setup")}
      </div>
    );

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-base font-bold text-ink-950">Working days</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {DAY_NAMES.map((n, i) => (
            <label
              key={n}
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={workingDays.includes(i + 1)}
                onChange={(e) =>
                  setDays(
                    e.target.checked
                      ? [...workingDays, i + 1].sort()
                      : workingDays.filter((d) => d !== i + 1),
                  )
                }
              />
              {n}
            </label>
          ))}
        </div>
        {days && (
          <div className="mt-3">
            <button
              className="btn-primary"
              disabled={saveDays.isPending || workingDays.length === 0}
              onClick={() => saveDays.mutate()}
            >
              {saveDays.isPending && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Save working days
            </button>
          </div>
        )}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink-950">
            Periods and breaks
          </h2>
          <div className="flex gap-2">
            {s.periods.length === 0 && can("timetable", "CREATE") && (
              <button
                className="btn border border-slate-300"
                disabled={defaults.isPending}
                onClick={() => defaults.mutate()}
              >
                Create standard periods
              </button>
            )}
            {can("timetable", "CREATE") && (
              <button className="btn-primary" onClick={() => setPeriod("new")}>
                <Plus size={16} />
                Add period
              </button>
            )}
          </div>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Starts</th>
              <th className="py-2">Ends</th>
              <th className="py-2">Type</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.periods.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No periods yet.
                </td>
              </tr>
            )}
            {s.periods.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-2 font-semibold">{p.name}</td>
                <td className="py-2">{p.startTime}</td>
                <td className="py-2">{p.endTime}</td>
                <td className="py-2">{p.isBreak ? "Break" : "Class period"}</td>
                <td className="py-2 text-right">
                  <button
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                    onClick={() => setPeriod(p)}
                    aria-label={`Edit ${p.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  {can("timetable", "DELETE") && (
                    <button
                      className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                      onClick={() =>
                        window.confirm(`Delete ${p.name}?`) &&
                        delPeriod.mutate(p.id)
                      }
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-950">Rooms</h2>
          {can("timetable", "CREATE") && (
            <button className="btn-primary" onClick={() => setRoom("new")}>
              <Plus size={16} />
              Add room
            </button>
          )}
        </div>
        <ul className="mt-3 divide-y divide-line text-sm">
          {s.rooms.length === 0 && (
            <li className="py-6 text-center text-slate-500">No rooms yet.</li>
          )}
          {s.rooms.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                <strong>{r.name}</strong>
                {r.capacity ? (
                  <span className="ml-2 text-xs text-slate-500">
                    seats {r.capacity}
                  </span>
                ) : null}
                {!r.isActive && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Inactive
                  </span>
                )}
              </span>
              <span>
                <button
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => setRoom(r)}
                  aria-label={`Edit ${r.name}`}
                >
                  <Pencil size={15} />
                </button>
                {can("timetable", "DELETE") && (
                  <button
                    className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                    onClick={() =>
                      window.confirm(`Delete room ${r.name}?`) &&
                      delRoom.mutate(r.id)
                    }
                    aria-label={`Delete ${r.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {period && (
        <PeriodDialog
          sessionId={sessionId}
          period={period === "new" ? null : period}
          onClose={() => setPeriod(null)}
          onSaved={() => {
            setPeriod(null);
            refresh();
          }}
        />
      )}
      {room && (
        <RoomDialog
          room={room === "new" ? null : room}
          onClose={() => setRoom(null)}
          onSaved={() => {
            setRoom(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PeriodDialog({
  sessionId,
  period,
  onClose,
  onSaved,
}: {
  sessionId: string;
  period: Period | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: period?.name ?? "",
    startTime: period?.startTime ?? "",
    endTime: period?.endTime ?? "",
    isBreak: period?.isBreak ?? false,
  });
  const save = useMutation<unknown, unknown, void>({
    mutationFn: async () => {
      if (period) {
        await api.put(`/timetable/periods/${period.id}`, f);
      } else {
        await api.post("/timetable/periods", { sessionId, ...f });
      }
    },
    onSuccess: () => {
      toast.success(period ? "Period updated" : "Period added");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  useEffect(() => {
    if (f.isBreak && !f.name) setF((s) => ({ ...s, name: "Break" }));
  }, [f.isBreak]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-sm p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {period ? "Edit period" : "Add period"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Name *">
            <input
              required
              className="input mt-1.5 font-normal"
              placeholder="Period 1"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts *">
              <input
                required
                type="time"
                className="input mt-1.5 font-normal"
                value={f.startTime}
                onChange={(e) => setF({ ...f, startTime: e.target.value })}
              />
            </Field>
            <Field label="Ends *">
              <input
                required
                type="time"
                className="input mt-1.5 font-normal"
                value={f.endTime}
                onChange={(e) => setF({ ...f, endTime: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={f.isBreak}
              onChange={(e) => setF({ ...f, isBreak: e.target.checked })}
            />
            This is a break (no classes)
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function RoomDialog({
  room,
  onClose,
  onSaved,
}: {
  room: Room | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: room?.name ?? "",
    capacity: room?.capacity ? String(room.capacity) : "",
    isActive: room?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name,
        capacity: f.capacity || undefined,
        isActive: f.isActive,
      };
      return room
        ? api.put(`/timetable/rooms/${room.id}`, body)
        : api.post("/timetable/rooms", body);
    },
    onSuccess: () => {
      toast.success(room ? "Room updated" : "Room added");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-sm p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {room ? "Edit room" : "Add room"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Room name *">
            <input
              required
              className="input mt-1.5 font-normal"
              placeholder="Room 5, Science Lab"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <Field label="Seats (optional)">
            <input
              type="number"
              min="1"
              className="input mt-1.5 font-normal"
              value={f.capacity}
              onChange={(e) => setF({ ...f, capacity: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={f.isActive}
              onChange={(e) => setF({ ...f, isActive: e.target.checked })}
            />
            In use
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

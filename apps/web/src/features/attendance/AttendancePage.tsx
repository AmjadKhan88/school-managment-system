import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { Field, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { Status, STATUS_META, STATUS_ORDER } from "./shared";

interface SectionOption {
  id: string;
  name: string;
  isActive: boolean;
}
interface Student {
  enrollmentId: string;
  studentId: string;
  rollNo: number | null;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  status: Status | null;
  markedBy: string | null;
  updatedBy: string | null;
}
interface Register {
  date: string;
  taken: boolean;
  students: Student[];
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();

  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(localToday());
  const [marks, setMarks] = useState<Record<string, Status>>({});

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

  const ready = !!(sessionId && classId && sectionId && date);
  const reg = useQuery({
    queryKey: ["attendance", "register", sessionId, classId, sectionId, date],
    enabled: ready,
    queryFn: async () =>
      (
        await api.get<{ data: Register }>("/attendance/register", {
          params: { sessionId, classId, sectionId, date },
        })
      ).data.data,
  });
  const data = reg.data;

  // Everyone starts as present. Saved values replace that once loaded.
  useEffect(() => {
    if (data)
      setMarks(
        Object.fromEntries(
          data.students.map((s) => [s.enrollmentId, s.status ?? "PRESENT"]),
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
    Object.values(marks).forEach((s) => {
      c[s]++;
    });
    return c;
  }, [marks]);

  const dirty =
    !!data &&
    (!data.taken ||
      data.students.some(
        (s) => (s.status ?? "PRESENT") !== marks[s.enrollmentId],
      ));
  const markedBy = data?.students.find((s) => s.markedBy)?.markedBy;

  const save = useMutation({
    mutationFn: () =>
      api.put<{
        data: { created: number; updated: number; unchanged: number };
      }>("/attendance/register", {
        sessionId,
        classId,
        sectionId,
        date,
        entries: data!.students.map((s) => ({
          enrollmentId: s.enrollmentId,
          status: marks[s.enrollmentId],
        })),
      }),
    onSuccess: (res) => {
      const r = res.data.data;
      toast.success(
        r.created + r.updated === 0
          ? "No changes to save"
          : `Attendance saved: ${r.created} recorded, ${r.updated} changed`,
      );
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const setAll = (s: Status) =>
    data &&
    setMarks(Object.fromEntries(data.students.map((x) => [x.enrollmentId, s])));

  if (!can("attendance", "VIEW"))
    return (
      <div className="card p-8 text-sm text-slate-600">
        You do not have permission to view attendance.
      </div>
    );

  return (
    <>
      <PageHeader
        title="Student Attendance"
        subtitle="Choose a class and date. Everyone starts as present: change the exceptions, then save."
      />

      <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Session">
          <select
            className="input mt-1.5 font-normal"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Select…</option>
            {user?.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
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
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section">
          <select
            className="input mt-1.5 font-normal"
            disabled={!classId}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">{classId ? "Select…" : "Pick a class"}</option>
            {sections.data
              ?.filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            max={localToday()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>

      {!ready && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a session, class, section and date to open the register.
        </div>
      )}
      {ready && reg.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {ready && reg.isError && (
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
                : "Attendance has not been taken for this date. Nothing is saved until you press Save."}
            </span>
          </div>

          {data.students.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              No active students are enrolled in this section for the selected
              session.
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
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    className="btn border border-emerald-600 py-1.5 text-emerald-700"
                    onClick={() => setAll("PRESENT")}
                  >
                    All present
                  </button>
                  <button
                    type="button"
                    className="btn border border-rose-500 py-1.5 text-rose-600"
                    onClick={() => setAll("ABSENT")}
                  >
                    All absent
                  </button>
                </span>
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Roll</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr
                        key={s.enrollmentId}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-2.5">{s.rollNo ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {s.fullName}
                          <span className="block text-xs text-slate-500">
                            {s.admissionNo}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div
                            role="group"
                            aria-label={`Attendance for ${s.fullName}`}
                            className="flex flex-wrap gap-1"
                          >
                            {STATUS_ORDER.map((st) => {
                              const active = marks[s.enrollmentId] === st;
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  aria-pressed={active}
                                  title={STATUS_META[st].label}
                                  onClick={() =>
                                    setMarks((m) => ({
                                      ...m,
                                      [s.enrollmentId]: st,
                                    }))
                                  }
                                  className={cn(
                                    "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition",
                                    active
                                      ? STATUS_META[st].active
                                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                  )}
                                >
                                  {STATUS_META[st].letter}
                                  <span className="hidden font-semibold sm:inline">
                                    {" "}
                                    {STATUS_META[st].label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {can("attendance", "CREATE") && (
                <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <p className="text-sm text-slate-600">
                    {dirty
                      ? "You have unsaved changes."
                      : "Everything is saved."}
                  </p>
                  <button
                    className="btn-primary px-6"
                    disabled={!dirty || save.isPending}
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

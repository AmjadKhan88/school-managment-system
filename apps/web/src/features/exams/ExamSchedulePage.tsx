import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  EXAM_STATUS_LABEL,
  EXAM_STATUS_STYLE,
  EXAM_TYPE_LABEL,
  ExamRow,
  toIso,
} from "./shared";

interface Paper {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  examDate: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  totalMarks: number;
  practicalMarks: number;
  passingMarks: number;
}
interface Form {
  examDate: string;
  startTime: string;
  endTime: string;
  room: string;
  totalMarks: string;
  practicalMarks: string;
  passingMarks: string;
}
interface Sheet {
  exam: {
    name: string;
    type: string;
    session: string;
    startDate: string;
    endDate: string;
  };
  classes: {
    className: string;
    rows: {
      date: string | null;
      day: string | null;
      subject: string;
      startTime: string | null;
      endTime: string | null;
      room: string | null;
    }[];
  }[];
}

const toForm = (p: Paper): Form => ({
  examDate: p.examDate ?? "",
  startTime: p.startTime ?? "",
  endTime: p.endTime ?? "",
  room: p.room ?? "",
  totalMarks: String(p.totalMarks),
  practicalMarks: String(p.practicalMarks),
  passingMarks: String(p.passingMarks),
});
const conflictsOf = (e: unknown): string[] =>
  (e as AxiosError<{ errors?: { conflicts?: string[] } }>)?.response?.data
    ?.errors?.conflicts ?? [];

export default function ExamSchedulePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [params, setParams] = useSearchParams();
  const [examId, setExamId] = useState(params.get("examId") ?? "");
  const [classId, setClassId] = useState("");
  const [rows, setRows] = useState<Record<string, Form>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [sheet, setSheet] = useState<"class" | "all" | null>(null);

  const exams = useQuery({
    queryKey: ["exams", "list", ""],
    queryFn: async () =>
      (await api.get<{ data: ExamRow[] }>("/exams")).data.data,
  });
  const exam = exams.data?.find((e) => e.id === examId);

  useEffect(() => {
    if (exam && !exam.classes.some((c) => c.classId === classId))
      setClassId(exam.classes[0]?.classId ?? "");
  }, [exam, classId]);

  const papers = useQuery({
    queryKey: ["exams", "schedule", examId, classId],
    enabled: !!examId && !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: Paper[] }>(`/exams/${examId}/schedule`, {
          params: { classId },
        })
      ).data.data,
  });
  useEffect(() => {
    if (papers.data) {
      setRows(
        Object.fromEntries(papers.data.map((p) => [p.subjectId, toForm(p)])),
      );
      setConflicts([]);
    }
  }, [papers.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["exams"] });
  const locked = exam?.status === "COMPLETED";
  const canEdit = can("exams", "EDIT") && !locked;
  const setRow = (id: string, patch: Partial<Form>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const save = useMutation({
    mutationFn: () =>
      api.put(`/exams/${examId}/schedule`, {
        classId,
        rows: (papers.data ?? []).map((p) => {
          const r = rows[p.subjectId];
          return {
            subjectId: p.subjectId,
            examDate: r.examDate || undefined,
            startTime: r.startTime || undefined,
            endTime: r.endTime || undefined,
            room: r.room || undefined,
            totalMarks: Number(r.totalMarks),
            practicalMarks: Number(r.practicalMarks || 0),
            passingMarks: Number(r.passingMarks),
          };
        }),
      }),
    onSuccess: () => {
      toast.success("Schedule saved");
      setConflicts([]);
      refresh();
    },
    onError: (e) => {
      const c = conflictsOf(e);
      setConflicts(c);
      toast.error(
        c.length
          ? "The schedule has conflicts. Nothing was saved."
          : apiMessage(e),
      );
    },
  });
  const sync = useMutation({
    mutationFn: () =>
      api.post<{ data: { created: number } }>(`/exams/${examId}/sync`),
    onSuccess: (res) => {
      toast.success(
        res.data.data.created
          ? `${res.data.data.created} paper(s) added`
          : "Already up to date",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const p of papers.data ?? []) {
      const r = rows[p.subjectId];
      if (r.examDate && (!r.startTime || !r.endTime)) {
        toast.error(`${p.subjectName}: enter start and end time`);
        return;
      }
      if (r.startTime && r.endTime && r.endTime <= r.startTime) {
        toast.error(
          `${p.subjectName}: the end time must be after the start time`,
        );
        return;
      }
      if (Number(r.passingMarks) > Number(r.totalMarks)) {
        toast.error(
          `${p.subjectName}: passing marks cannot exceed total marks`,
        );
        return;
      }
    }
    save.mutate();
  };

  return (
    <>
      <PageHeader
        title="Exam Schedule"
        subtitle="Set the date, time, room and marks for each subject paper. Conflicts are checked when you save."
        actions={
          exam && (
            <div className="no-print flex flex-wrap gap-2">
              {canEdit && (
                <button
                  className="btn border border-slate-300"
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                >
                  {sync.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  Sync subjects
                </button>
              )}
              {can("exams", "PRINT") && (
                <button
                  className="btn border border-slate-300"
                  onClick={() => setSheet("class")}
                  disabled={!classId}
                >
                  <Printer size={16} />
                  Date sheet
                </button>
              )}
              {can("exams", "PRINT") && (
                <button
                  className="btn border border-slate-300"
                  onClick={() => setSheet("all")}
                >
                  <Printer size={16} />
                  All classes
                </button>
              )}
            </div>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <select
          className="input"
          value={examId}
          onChange={(e) => {
            setExamId(e.target.value);
            setParams(e.target.value ? { examId: e.target.value } : {});
            setClassId("");
          }}
          aria-label="Exam"
        >
          <option value="">Choose an exam…</option>
          {exams.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.sessionName})
            </option>
          ))}
        </select>
        {exam && (
          <p className="self-center text-sm text-slate-600">
            {EXAM_TYPE_LABEL[exam.type]} · {fmtDate(exam.startDate)} to{" "}
            {fmtDate(exam.endDate)}{" "}
            <span
              className={cn(
                "ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                EXAM_STATUS_STYLE[exam.status],
              )}
            >
              {EXAM_STATUS_LABEL[exam.status]}
            </span>
          </p>
        )}
      </div>

      {!examId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose an exam to edit its schedule.
        </div>
      )}

      {exam && (
        <>
          <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-line">
            {exam.classes.map((c) => (
              <button
                key={c.classId}
                onClick={() => setClassId(c.classId)}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
                  classId === c.classId
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {c.className}
              </button>
            ))}
          </div>

          {conflicts.length > 0 && (
            <div
              className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
              role="alert"
            >
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle size={16} />
                Nothing was saved. Fix these conflicts:
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {papers.isLoading && (
            <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
          )}
          {papers.isError && (
            <div className="card p-6 text-center text-sm text-rose-600">
              {apiMessage(papers.error, "Could not load the schedule")}
            </div>
          )}
          {papers.data?.length === 0 && (
            <div className="card p-8 text-center text-sm text-slate-500">
              This class has no subject papers. Map subjects to the class under
              Class-Subject Mapping, then press <strong>Sync subjects</strong>.
            </div>
          )}

          {!!papers.data?.length && (
            <form onSubmit={submit}>
              <fieldset disabled={!canEdit} className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      {[
                        "Subject",
                        "Date",
                        "Start",
                        "End",
                        "Room",
                        "Total",
                        "Practical",
                        "Passing",
                      ].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {papers.data.map((p) => {
                      const r = rows[p.subjectId];
                      if (!r) return null;
                      return (
                        <tr
                          key={p.subjectId}
                          className="border-b border-line last:border-0"
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">
                            {p.subjectName}
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              {p.subjectCode}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              min={toIso(exam.startDate)}
                              max={toIso(exam.endDate)}
                              className="input w-40 py-1.5"
                              value={r.examDate}
                              onChange={(e) =>
                                setRow(p.subjectId, {
                                  examDate: e.target.value,
                                })
                              }
                              aria-label={`${p.subjectName} date`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              className="input w-28 py-1.5"
                              value={r.startTime}
                              onChange={(e) =>
                                setRow(p.subjectId, {
                                  startTime: e.target.value,
                                })
                              }
                              aria-label={`${p.subjectName} start`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="time"
                              className="input w-28 py-1.5"
                              value={r.endTime}
                              onChange={(e) =>
                                setRow(p.subjectId, { endTime: e.target.value })
                              }
                              aria-label={`${p.subjectName} end`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input w-24 py-1.5"
                              placeholder="Room"
                              value={r.room}
                              onChange={(e) =>
                                setRow(p.subjectId, { room: e.target.value })
                              }
                              aria-label={`${p.subjectName} room`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              max="1000"
                              className="input w-20 py-1.5"
                              value={r.totalMarks}
                              onChange={(e) =>
                                setRow(p.subjectId, {
                                  totalMarks: e.target.value,
                                })
                              }
                              aria-label={`${p.subjectName} total marks`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              className="input w-20 py-1.5"
                              value={r.practicalMarks}
                              onChange={(e) =>
                                setRow(p.subjectId, {
                                  practicalMarks: e.target.value,
                                })
                              }
                              aria-label={`${p.subjectName} practical marks`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              className="input w-20 py-1.5"
                              value={r.passingMarks}
                              onChange={(e) =>
                                setRow(p.subjectId, {
                                  passingMarks: e.target.value,
                                })
                              }
                              aria-label={`${p.subjectName} passing marks`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </fieldset>
              {canEdit && (
                <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-end border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <button
                    className="btn-primary px-6"
                    disabled={save.isPending}
                  >
                    {save.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save schedule
                  </button>
                </div>
              )}
              {locked && (
                <p className="mt-3 text-sm text-slate-500">
                  This exam is completed, so its schedule is locked.
                </p>
              )}
            </form>
          )}
        </>
      )}

      {sheet && exam && (
        <DateSheetDialog
          examId={exam.id}
          classId={sheet === "class" ? classId : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function DateSheetDialog({
  examId,
  classId,
  onClose,
}: {
  examId: string;
  classId?: string;
  onClose: () => void;
}) {
  const school = useAuth((s) => s.user?.school.name);
  const q = useQuery({
    queryKey: ["exams", "date-sheet", examId, classId],
    queryFn: async () =>
      (
        await api.get<{ data: Sheet }>(`/exams/${examId}/date-sheet`, {
          params: { classId },
        })
      ).data.data,
  });
  const d = q.data;

  const print = () => {
    document.body.classList.add("print-voucher");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("print-voucher"),
      { once: true },
    );
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-3xl p-6">
        <div className="no-print flex items-center justify-between">
          <h2 className="text-lg font-bold">Date sheet</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {q.isLoading && (
          <Loader2 className="mx-auto my-10 animate-spin text-slate-400" />
        )}
        {q.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(q.error, "Could not load the date sheet")}
          </p>
        )}
        {d && (
          <>
            <div id="datesheet" className="mt-3">
              {d.classes.length === 0 && (
                <p className="text-sm text-slate-500">No papers to show.</p>
              )}
              {d.classes.map((c, i) => (
                <section
                  key={c.className}
                  className={cn(
                    "pb-6",
                    i < d.classes.length - 1 && "break-after-page",
                  )}
                >
                  <div className="text-center">
                    <p className="text-lg font-extrabold text-ink-950">
                      {school}
                    </p>
                    <p className="text-base font-bold">
                      {d.exam.name} · Date sheet
                    </p>
                    <p className="text-sm text-slate-600">
                      {EXAM_TYPE_LABEL[d.exam.type]} · Session {d.exam.session}{" "}
                      · {fmtDate(d.exam.startDate)} to {fmtDate(d.exam.endDate)}
                    </p>
                    <p className="mt-2 inline-block rounded-full bg-slate-100 px-4 py-1 text-sm font-bold">
                      {c.className}
                    </p>
                  </div>
                  <table className="mt-4 w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-y-2 border-slate-800 text-left">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Day</th>
                        <th className="py-2 pr-3">Subject</th>
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2">Room</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-300">
                          <td className="py-2 pr-3">
                            {r.date ? fmtDate(r.date) : "To be announced"}
                          </td>
                          <td className="py-2 pr-3">{r.day ?? ""}</td>
                          <td className="py-2 pr-3 font-semibold">
                            {r.subject}
                          </td>
                          <td className="py-2 pr-3">
                            {r.startTime && r.endTime
                              ? `${r.startTime} – ${r.endTime}`
                              : ""}
                          </td>
                          <td className="py-2">{r.room ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-10 flex justify-between text-xs text-slate-500">
                    <span className="border-t border-slate-400 px-6 pt-1">
                      Class teacher
                    </span>
                    <span className="border-t border-slate-400 px-6 pt-1">
                      Principal
                    </span>
                  </div>
                </section>
              ))}
            </div>
            <div className="no-print mt-5 flex justify-end gap-2">
              <button className="btn border border-slate-300" onClick={onClose}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={print}
                disabled={d.classes.length === 0}
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Lock,
  Save,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { ExamRow } from "./shared";
import { useMyScope } from "@/features/staff/shared";

type Flag = "" | "ABSENT" | "EXEMPT";
interface GridStudent {
  enrollmentId: string;
  rollNo: number | null;
  admissionNo: string;
  fullName: string;
  section: string;
  mark: {
    status: "ENTERED" | "ABSENT" | "EXEMPT";
    theory: number | null;
    practical: number | null;
    remarks: string | null;
  } | null;
}
interface Paper {
  subjectName: string;
  totalMarks: number;
  practicalMarks: number;
  passingMarks: number;
  theoryMax: number;
}
interface Grid {
  exam: { id: string; name: string; status: string };
  paper: Paper;
  locked: string | null;
  students: GridStudent[];
  summary: { entered: number; absent: number; exempt: number; missing: number };
}
interface Progress {
  expected: number;
  locked: string | null;
  papers: {
    subjectId: string;
    subjectName: string;
    expected: number;
    entered: number;
    absent: number;
    exempt: number;
    missing: number;
  }[];
}
interface Row {
  flag: Flag;
  theory: string;
  practical: string;
  remarks: string;
}
interface Imported {
  entries: {
    enrollmentId: string;
    status: "ENTERED" | "ABSENT" | "EXEMPT" | null;
    theory?: number;
    practical?: number;
    remarks?: string;
  }[];
  errors: { row: number; admissionNo: string; message: string }[];
  rowsRead: number;
}

const fromMark = (s: GridStudent): Row => ({
  flag:
    s.mark?.status === "ABSENT"
      ? "ABSENT"
      : s.mark?.status === "EXEMPT"
        ? "EXEMPT"
        : "",
  theory:
    s.mark?.status === "ENTERED" && s.mark.theory !== null
      ? String(s.mark.theory)
      : "",
  practical:
    s.mark?.status === "ENTERED" && s.mark.practical !== null
      ? String(s.mark.practical)
      : "",
  remarks: s.mark?.remarks ?? "",
});
const effective = (r: Row) =>
  r.flag
    ? r.flag
    : r.theory !== "" || r.practical !== ""
      ? ("ENTERED" as const)
      : null;

function rowError(p: Paper, r: Row): string | null {
  if (r.flag || (r.theory === "" && r.practical === "")) return null;
  const t = r.theory === "" ? (p.theoryMax === 0 ? 0 : NaN) : Number(r.theory);
  if (isNaN(t)) return "Enter theory marks";
  if (t < 0 || t > p.theoryMax) return `0 to ${p.theoryMax}`;
  if (p.practicalMarks > 0) {
    const pr = r.practical === "" ? NaN : Number(r.practical);
    if (isNaN(pr)) return "Enter practical marks";
    if (pr < 0 || pr > p.practicalMarks) return `0 to ${p.practicalMarks}`;
  }
  return null;
}

const serverErrors = (e: unknown) =>
  (
    e as AxiosError<{
      errors?: { errors?: { name: string; message: string }[] };
    }>
  )?.response?.data?.errors?.errors ?? [];

export default function MarksEntryPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [problems, setProblems] = useState<{ name: string; message: string }[]>(
    [],
  );
  const [importIssues, setImportIssues] = useState<Imported["errors"]>([]);
  const [busy, setBusy] = useState(false);

  const exams = useQuery({
    queryKey: ["exams", "list", ""],
    queryFn: async () =>
      (await api.get<{ data: ExamRow[] }>("/exams")).data.data,
  });
  const exam = exams.data?.find((e) => e.id === examId);

  const scope = useMyScope(exam?.sessionId ?? "");
  const onlyTeaching = scope.data?.restricted ? scope.data : null;
  const classOptions = exam?.classes.filter(
    (c) =>
      !onlyTeaching ||
      onlyTeaching.teaching.some((t) => t.classId === c.classId),
  );

  useEffect(() => {
    if (exam && !exam.classes.some((c) => c.classId === classId)) {
      setClassId(exam.classes[0]?.classId ?? "");
      setSubjectId("");
    }
  }, [exam, classId]);

  const progress = useQuery({
    queryKey: ["marks", "progress", examId, classId],
    enabled: !!examId && !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: Progress }>("/marks/progress", {
          params: { examId, classId },
        })
      ).data.data,
  });
  useEffect(() => {
    if (
      progress.data &&
      !progress.data.papers.some((p) => p.subjectId === subjectId)
    )
      setSubjectId(progress.data.papers[0]?.subjectId ?? "");
  }, [progress.data, subjectId]);

  const grid = useQuery({
    queryKey: ["marks", "grid", examId, classId, subjectId],
    enabled: !!examId && !!classId && !!subjectId,
    queryFn: async () =>
      (
        await api.get<{ data: Grid }>("/marks/grid", {
          params: { examId, classId, subjectId },
        })
      ).data.data,
  });
  const g = grid.data;
  useEffect(() => {
    if (g) {
      setRows(
        Object.fromEntries(
          g.students.map((s) => [s.enrollmentId, fromMark(s)]),
        ),
      );
      setProblems([]);
      setImportIssues([]);
    }
  }, [g]);

  const canEnter = can("marks", "CREATE") && !!g && !g.locked;
  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const errors = useMemo(
    () =>
      g
        ? Object.fromEntries(
            g.students.map((s) => [
              s.enrollmentId,
              rowError(g.paper, rows[s.enrollmentId] ?? fromMark(s)),
            ]),
          )
        : {},
    [g, rows],
  );
  const invalid = Object.values(errors).filter(Boolean).length;
  const dirty =
    !!g &&
    g.students.some(
      (s) =>
        JSON.stringify(rows[s.enrollmentId]) !== JSON.stringify(fromMark(s)),
    );

  const save = useMutation({
    mutationFn: () =>
      api.put<{ data: { created: number; updated: number; cleared: number } }>(
        "/marks/grid",
        {
          examId,
          classId,
          subjectId,
          entries: g!.students.map((s) => {
            const r = rows[s.enrollmentId];
            const status = effective(r);
            return {
              enrollmentId: s.enrollmentId,
              status,
              theory:
                status === "ENTERED" && r.theory !== ""
                  ? Number(r.theory)
                  : undefined,
              practical:
                status === "ENTERED" && r.practical !== ""
                  ? Number(r.practical)
                  : undefined,
              remarks: r.remarks || undefined,
            };
          }),
        },
      ),
    onSuccess: (res) => {
      const r = res.data.data;
      toast.success(
        r.created + r.updated + r.cleared === 0
          ? "No changes to save"
          : `Marks saved: ${r.created} new, ${r.updated} changed${r.cleared ? `, ${r.cleared} cleared` : ""}`,
      );
      setProblems([]);
      qc.invalidateQueries({ queryKey: ["marks"] });
      qc.invalidateQueries({ queryKey: ["results"] });
    },
    onError: (e) => {
      setProblems(serverErrors(e));
      toast.error(apiMessage(e));
    },
  });

  const exportXlsx = async () => {
    setBusy(true);
    try {
      await downloadFile(
        "/marks/export",
        { examId, classId, subjectId },
        "marks.xlsx",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const importXlsx = async (file: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("examId", examId);
      body.append("classId", classId);
      body.append("subjectId", subjectId);
      const res = await api.post<{ data: Imported }>(
        "/marks/import/parse",
        body,
      );
      const r = res.data.data;
      setRows((cur) => {
        const next = { ...cur };
        r.entries.forEach((e) => {
          next[e.enrollmentId] = {
            flag:
              e.status === "ABSENT"
                ? "ABSENT"
                : e.status === "EXEMPT"
                  ? "EXEMPT"
                  : "",
            theory:
              e.status === "ENTERED" && e.theory !== undefined
                ? String(e.theory)
                : "",
            practical:
              e.status === "ENTERED" && e.practical !== undefined
                ? String(e.practical)
                : "",
            remarks: e.remarks ?? "",
          };
        });
        return next;
      });
      setImportIssues(r.errors);
      toast.success(
        `Loaded ${r.entries.length} of ${r.rowsRead} rows${r.errors.length ? `. ${r.errors.length} row(s) had problems.` : ". Review them and press Save."}`,
      );
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
    col: string,
    i: number,
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    document
      .querySelector<HTMLInputElement>(
        `[data-col="${col}"][data-row="${i + 1}"]`,
      )
      ?.focus();
  };

  const startable = exams.data?.filter((e) => e.status !== "DRAFT") ?? [];
  const bulk = (mode: "absent" | "clear") =>
    g &&
    setRows(
      Object.fromEntries(
        g.students.map((s) => {
          const r = rows[s.enrollmentId];
          if (mode === "clear")
            return [
              s.enrollmentId,
              { flag: "" as Flag, theory: "", practical: "", remarks: "" },
            ];
          return [
            s.enrollmentId,
            effective(r) === null ? { ...r, flag: "ABSENT" as Flag } : r,
          ];
        }),
      ),
    );

  return (
    <>
      <PageHeader
        title="Marks Entry"
        subtitle="Choose an exam, class and subject, then enter marks. Marks are checked against the paper's maximum."
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <select
          className="input"
          value={examId}
          onChange={(e) => {
            setExamId(e.target.value);
            setClassId("");
            setSubjectId("");
          }}
          aria-label="Exam"
        >
          <option value="">Choose an exam…</option>
          {startable.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.sessionName})
            </option>
          ))}
        </select>
        <select
          className="input"
          value={classId}
          disabled={!exam}
          onChange={(e) => {
            setClassId(e.target.value);
            setSubjectId("");
          }}
          aria-label="Class"
        >
          <option value="">
            {exam ? "Choose a class…" : "Choose an exam first"}
          </option>
          {classOptions?.map((c) => (
            <option key={c.classId} value={c.classId}>
              {c.className}
            </option>
          ))}
        </select>
      </div>
      {exams.data && startable.length === 0 && (
        <div className="card mb-4 p-6 text-center text-sm text-slate-500">
          Marks can be entered once an exam is published. Publish one under
          Exams.
        </div>
      )}

      {progress.data && (
        <div className="mb-4 flex flex-wrap gap-2">
          {progress.data.papers.map((p) => {
            const done = p.missing === 0 && p.expected > 0;
            return (
              <button
                key={p.subjectId}
                onClick={() => setSubjectId(p.subjectId)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-left text-sm",
                  subjectId === p.subjectId
                    ? "border-brand-600 bg-brand-50"
                    : "border-line bg-white hover:bg-slate-50",
                )}
              >
                {done ? (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                ) : null}
                <span className="font-semibold">{p.subjectName}</span>
                <span className="text-xs text-slate-500">
                  {p.expected - p.missing}/{p.expected}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {grid.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {grid.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(grid.error, "Could not load the marks grid")}
        </div>
      )}

      {g && (
        <>
          {g.locked && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Lock size={16} className="mt-0.5 shrink-0" />
              {g.locked}
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{g.paper.subjectName}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
              Out of {g.paper.totalMarks}
              {g.paper.practicalMarks > 0
                ? ` (theory ${g.paper.theoryMax}, practical ${g.paper.practicalMarks})`
                : ""}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
              Passing {g.paper.passingMarks}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              {canEnter && (
                <button
                  type="button"
                  className="btn border border-slate-300 py-1.5"
                  onClick={() => bulk("absent")}
                >
                  Empty rows: absent
                </button>
              )}
              {canEnter && (
                <button
                  type="button"
                  className="btn border border-slate-300 py-1.5"
                  onClick={() =>
                    window.confirm(
                      "Clear every row on screen? Nothing is lost until you save.",
                    ) && bulk("clear")
                  }
                >
                  Clear all
                </button>
              )}
              {can("marks", "EXPORT") && (
                <button
                  type="button"
                  className="btn border border-slate-300 py-1.5"
                  onClick={exportXlsx}
                  disabled={busy}
                >
                  <FileSpreadsheet size={15} />
                  Excel
                </button>
              )}
              {canEnter && (
                <label
                  className={cn(
                    "btn cursor-pointer border border-slate-300 py-1.5",
                    busy && "opacity-60",
                  )}
                >
                  <Upload size={15} />
                  Import
                  <input
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importXlsx(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </span>
          </div>

          {importIssues.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle size={15} />
                These rows were not loaded:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {importIssues.slice(0, 15).map((i) => (
                  <li key={i.row}>
                    Row {i.row} ({i.admissionNo}): {i.message}
                  </li>
                ))}
              </ul>
              {importIssues.length > 15 && (
                <p className="mt-1">and {importIssues.length - 15} more.</p>
              )}
            </div>
          )}
          {problems.length > 0 && (
            <div
              className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              role="alert"
            >
              <p className="font-bold">Nothing was saved. Fix these marks:</p>
              <ul className="mt-1 list-disc pl-5">
                {problems.map((p, i) => (
                  <li key={i}>
                    {p.name}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset disabled={!canEnter} className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-3">Roll</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">
                    {g.paper.practicalMarks > 0
                      ? `Theory (${g.paper.theoryMax})`
                      : `Marks (${g.paper.totalMarks})`}
                  </th>
                  {g.paper.practicalMarks > 0 && (
                    <th className="px-3 py-3">
                      Practical ({g.paper.practicalMarks})
                    </th>
                  )}
                  <th className="px-3 py-3">Flag</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {g.students.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No active students are enrolled in this class.
                    </td>
                  </tr>
                )}
                {g.students.map((s, i) => {
                  const r = rows[s.enrollmentId];
                  if (!r) return null;
                  const err = errors[s.enrollmentId];
                  const total =
                    (Number(r.theory) || 0) + (Number(r.practical) || 0);
                  const entered = effective(r) === "ENTERED";
                  return (
                    <tr
                      key={s.enrollmentId}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-3 py-2">{s.rollNo ?? "—"}</td>
                      <td className="px-3 py-2">
                        {s.fullName}
                        <span className="block text-xs text-slate-500">
                          {s.admissionNo}
                          {s.section ? ` · ${s.section}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          data-col="theory"
                          data-row={i}
                          disabled={!!r.flag}
                          onKeyDown={(e) => onEnter(e, "theory", i)}
                          className={cn(
                            "input w-24 py-1.5",
                            err && "border-rose-400",
                          )}
                          value={r.theory}
                          onChange={(e) =>
                            setRow(s.enrollmentId, { theory: e.target.value })
                          }
                          aria-label={`${s.fullName} marks`}
                        />
                        {err && (
                          <span className="mt-0.5 block text-xs text-rose-600">
                            {err}
                          </span>
                        )}
                      </td>
                      {g.paper.practicalMarks > 0 && (
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            data-col="practical"
                            data-row={i}
                            disabled={!!r.flag}
                            onKeyDown={(e) => onEnter(e, "practical", i)}
                            className={cn(
                              "input w-24 py-1.5",
                              err && "border-rose-400",
                            )}
                            value={r.practical}
                            onChange={(e) =>
                              setRow(s.enrollmentId, {
                                practical: e.target.value,
                              })
                            }
                            aria-label={`${s.fullName} practical marks`}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <select
                          className="input w-28 py-1.5"
                          value={r.flag}
                          onChange={(e) =>
                            setRow(s.enrollmentId, {
                              flag: e.target.value as Flag,
                              ...(e.target.value
                                ? { theory: "", practical: "" }
                                : {}),
                            })
                          }
                          aria-label={`${s.fullName} flag`}
                        >
                          <option value="">—</option>
                          <option value="ABSENT">Absent</option>
                          <option value="EXEMPT">Exempt</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.flag === "ABSENT" ? (
                          <span className="font-semibold text-rose-600">
                            Abs
                          </span>
                        ) : r.flag === "EXEMPT" ? (
                          <span className="text-slate-500">Ex</span>
                        ) : entered && !err ? (
                          <span
                            className={cn(
                              "font-semibold",
                              total >= g.paper.passingMarks
                                ? "text-emerald-600"
                                : "text-rose-600",
                            )}
                          >
                            {total}
                            {total < g.paper.passingMarks ? " (fail)" : ""}
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input w-44 py-1.5"
                          value={r.remarks}
                          onChange={(e) =>
                            setRow(s.enrollmentId, { remarks: e.target.value })
                          }
                          aria-label={`${s.fullName} remarks`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </fieldset>

          {canEnter && g.students.length > 0 && (
            <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
              <p className="text-sm text-slate-600">
                {invalid > 0
                  ? `${invalid} row(s) need attention.`
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
                Save marks
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  FileSpreadsheet,
  Loader2,
  Lock,
  Printer,
  Send,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { EXAM_TYPE_LABEL, ExamRow } from "./shared";

interface Subject {
  paperId: string;
  name: string;
  totalMarks: number;
  passingMarks: number;
}
interface Student {
  enrollmentId: string;
  rollNo: number | null;
  section: string;
  admissionNo: string;
  fullName: string;
  subjects: {
    paperId: string;
    status: string | null;
    obtained: string | null;
    grade: string | null;
    passed: boolean | null;
  }[];
  totalObtained: string;
  totalMax: string;
  percentage: string | null;
  grade: string | null;
  gpa: string | null;
  result: "PASS" | "FAIL" | "INCOMPLETE";
  failedSubjects: number;
  position: number | null;
}
interface Results {
  exam: {
    id: string;
    name: string;
    type: string;
    status: string;
    session: string;
  };
  className: string;
  published: boolean;
  publishedAt: string | null;
  subjects: Subject[];
  students: Student[];
  summary: {
    students: number;
    passed: number;
    failed: number;
    incomplete: number;
    average: number | null;
    highest: number | null;
  };
}
interface SectionOption {
  id: string;
  name: string;
}
interface Missing {
  subject: string;
  count: number;
  sample: string[];
}

const RESULT_STYLE = {
  PASS: "bg-emerald-100 text-emerald-700",
  FAIL: "bg-rose-100 text-rose-700",
  INCOMPLETE: "bg-amber-100 text-amber-700",
};
const missingOf = (e: unknown) =>
  (e as AxiosError<{ errors?: { missing?: Missing[] } }>)?.response?.data
    ?.errors?.missing ?? [];

export default function ClassResultsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const school = useAuth((s) => s.user?.school.name);
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sort, setSort] = useState<"roll" | "position" | "percentage">("roll");
  const [missing, setMissing] = useState<Missing[]>([]);
  const [exporting, setExporting] = useState(false);

  const exams = useQuery({
    queryKey: ["exams", "list", ""],
    queryFn: async () =>
      (await api.get<{ data: ExamRow[] }>("/exams")).data.data,
  });
  const exam = exams.data?.find((e) => e.id === examId);
  useEffect(() => {
    if (exam && !exam.classes.some((c) => c.classId === classId)) {
      setClassId(exam.classes[0]?.classId ?? "");
      setSectionId("");
    }
  }, [exam, classId]);

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
  const params = { examId, classId, sectionId: sectionId || undefined };
  const q = useQuery({
    queryKey: ["results", "class", params],
    enabled: !!examId && !!classId,
    queryFn: async () =>
      (await api.get<{ data: Results }>("/results/class", { params })).data
        .data,
  });
  const d = q.data;
  useEffect(() => {
    setMissing([]);
  }, [examId, classId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["results"] });
    qc.invalidateQueries({ queryKey: ["marks"] });
    qc.invalidateQueries({ queryKey: ["exams"] });
  };

  const publish = useMutation({
    mutationFn: () =>
      api.post<{ data: { students: number; examCompleted: boolean } }>(
        "/results/publish",
        { examId, classId },
      ),
    onSuccess: (res) => {
      toast.success(
        `Results published for ${res.data.data.students} students${res.data.data.examCompleted ? ". The exam is now complete." : ""}`,
      );
      setMissing([]);
      refresh();
    },
    onError: (e) => {
      setMissing(missingOf(e));
      toast.error(apiMessage(e));
    },
  });
  const unpublish = useMutation({
    mutationFn: (reason: string) =>
      api.post("/results/unpublish", { examId, classId, reason }),
    onSuccess: () => {
      toast.success("Results unpublished. Marks can be edited again.");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const askUnpublish = () => {
    const reason = window.prompt(
      "Why are these published results being unpublished? This is recorded.",
    );
    if (reason && reason.trim().length >= 3) unpublish.mutate(reason.trim());
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile("/results/class/export", params, "class-results.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const students = d
    ? [...d.students].sort((a, b) =>
        sort === "position"
          ? (a.position ?? 9999) - (b.position ?? 9999) ||
            (a.rollNo ?? 0) - (b.rollNo ?? 0)
          : sort === "percentage"
            ? Number(b.percentage ?? -1) - Number(a.percentage ?? -1)
            : a.section.localeCompare(b.section) ||
              (a.rollNo ?? 9999) - (b.rollNo ?? 9999),
      )
    : [];

  return (
    <>
      <PageHeader
        title="Class Results"
        subtitle="Provisional results update as marks are entered. Publishing freezes them."
        actions={
          d && (
            <div className="no-print flex flex-wrap gap-2">
              <button
                className="btn border border-slate-300"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                Print
              </button>
              {can("results", "EXPORT") && (
                <button
                  className="btn border border-slate-300"
                  onClick={exportXlsx}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={16} />
                  )}
                  Excel
                </button>
              )}
              {can("results", "APPROVE") && !d.published && (
                <button
                  className="btn-primary"
                  onClick={() =>
                    window.confirm(
                      `Publish the results of ${d.className}? Marks will be locked.`,
                    ) && publish.mutate()
                  }
                  disabled={publish.isPending}
                >
                  {publish.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Publish results
                </button>
              )}
              {can("results", "APPROVE") && d.published && (
                <button
                  className="btn border border-amber-500 text-amber-700"
                  onClick={askUnpublish}
                  disabled={unpublish.isPending}
                >
                  <Undo2 size={16} />
                  Unpublish
                </button>
              )}
            </div>
          )
        }
      />

      <div className="no-print card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <select
          className="input"
          value={examId}
          onChange={(e) => {
            setExamId(e.target.value);
            setClassId("");
          }}
          aria-label="Exam"
        >
          <option value="">Choose an exam…</option>
          {exams.data
            ?.filter((e) => e.status !== "DRAFT")
            .map((e) => (
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
            setSectionId("");
          }}
          aria-label="Class"
        >
          <option value="">
            {exam ? "Choose a class…" : "Choose an exam first"}
          </option>
          {exam?.classes.map((c) => (
            <option key={c.classId} value={c.classId}>
              {c.className}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={sectionId}
          disabled={!classId}
          onChange={(e) => setSectionId(e.target.value)}
          aria-label="Section"
        >
          <option value="">All sections</option>
          {sections.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!examId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a published exam and a class.
        </div>
      )}
      {q.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load results")}
        </div>
      )}

      {missing.length > 0 && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          role="alert"
        >
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={16} />
            Nothing was published. Marks are missing:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {missing.map((m) => (
              <li key={m.subject}>
                <strong>{m.subject}</strong>: {m.count} student(s), for example{" "}
                {m.sample.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d && (
        <>
          <div
            className={cn(
              "no-print mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm",
              d.published
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            {d.published ? (
              <Lock size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
            <span>
              {d.published
                ? `Published on ${fmtDate(d.publishedAt)}. These figures are frozen and the marks are locked.`
                : "Provisional results from the marks entered so far. A student with a missing mark shows as Incomplete."}
            </span>
          </div>

          <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ["Students", d.summary.students],
              ["Passed", d.summary.passed],
              ["Failed", d.summary.failed],
              ["Incomplete", d.summary.incomplete],
              [
                "Class average",
                d.summary.average === null ? "—" : `${d.summary.average}%`,
              ],
              [
                "Highest",
                d.summary.highest === null ? "—" : `${d.summary.highest}%`,
              ],
            ].map(([l, v]) => (
              <div key={String(l)} className="card p-3">
                <p className="text-xs font-semibold text-slate-500">{l}</p>
                <p className="mt-0.5 text-xl font-extrabold text-ink-950">
                  {v}
                </p>
              </div>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="hidden text-base font-bold print:block">
              {school}: {d.exam.name} results, {d.className} ({d.exam.session})
            </h2>
            <label className="no-print ml-auto flex items-center gap-2 text-sm font-semibold">
              Sort by
              <select
                className="input w-40 py-1.5 font-normal"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="roll">Roll number</option>
                <option value="position">Position</option>
                <option value="percentage">Percentage</option>
              </select>
            </label>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-3">Pos</th>
                  <th className="px-3 py-3">Roll</th>
                  <th className="px-3 py-3">Student</th>
                  {d.subjects.map((s) => (
                    <th key={s.paperId} className="whitespace-nowrap px-3 py-3">
                      {s.name}
                      <span className="block font-normal text-slate-400">
                        /{s.totalMarks}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">%</th>
                  <th className="px-3 py-3">Grade</th>
                  <th className="px-3 py-3">GPA</th>
                  <th className="px-3 py-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={d.subjects.length + 8}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No students to show.
                    </td>
                  </tr>
                )}
                {students.map((s) => (
                  <tr
                    key={s.enrollmentId}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-3 py-2.5 font-bold">
                      {s.position ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">{s.rollNo ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {s.fullName}
                      <span className="block text-xs text-slate-500">
                        {s.admissionNo}
                      </span>
                    </td>
                    {d.subjects.map((sub) => {
                      const x = s.subjects.find(
                        (y) => y.paperId === sub.paperId,
                      );
                      return (
                        <td
                          key={sub.paperId}
                          className="whitespace-nowrap px-3 py-2.5"
                        >
                          {x?.status === "ABSENT" ? (
                            <span className="font-semibold text-rose-600">
                              Abs
                            </span>
                          ) : x?.status === "EXEMPT" ? (
                            <span className="text-slate-400">Ex</span>
                          ) : x?.obtained !== null &&
                            x?.obtained !== undefined ? (
                            <span
                              className={cn(
                                x.passed === false &&
                                  "font-semibold text-rose-600",
                              )}
                            >
                              {Number(x.obtained)}
                              {x.grade ? (
                                <span className="ml-1 text-xs text-slate-400">
                                  {x.grade}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-amber-500">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                      {Number(s.totalObtained)}
                      <span className="font-normal text-slate-400">
                        /{Number(s.totalMax)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {s.percentage === null ? "—" : `${s.percentage}%`}
                    </td>
                    <td className="px-3 py-2.5 font-semibold">
                      {s.grade ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">{s.gpa ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          RESULT_STYLE[s.result],
                        )}
                      >
                        {s.result.charAt(0) + s.result.slice(1).toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="no-print mt-3 text-xs text-slate-500">
            {EXAM_TYPE_LABEL[d.exam.type]}. Pass means every counted paper
            reaches its passing marks. Positions go to students who pass, ranked
            by percentage, with ties sharing a position. Abs = absent, Ex =
            exempt.
          </p>
        </>
      )}
    </>
  );
}

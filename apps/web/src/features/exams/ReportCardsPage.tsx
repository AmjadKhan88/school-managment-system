import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Printer, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { CardsData, ReportCardView } from "./ReportCardView";
import { ExamRow } from "./shared";

interface SectionOption {
  id: string;
  name: string;
}
interface Draft {
  teacher: string;
  principal: string;
}

const SUGGESTIONS = [
  "Excellent performance. Keep it up.",
  "Very good effort this term.",
  "Satisfactory. Can do better with regular practice.",
  "Needs to improve attendance and homework.",
  "Shows steady improvement.",
  "Please give more time to weak subjects.",
];

export default function ReportCardsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [tab, setTab] = useState<"cards" | "remarks">("cards");
  const [preview, setPreview] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

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
    queryKey: ["report-cards", "class", params],
    enabled: !!examId && !!classId,
    retry: false,
    queryFn: async () =>
      (await api.get<{ data: CardsData }>("/report-cards/class", { params }))
        .data.data,
  });
  const d = q.data;

  useEffect(() => {
    if (d)
      setDrafts(
        Object.fromEntries(
          d.cards.map((c) => [
            c.student.id,
            {
              teacher: c.remarks.teacher ?? "",
              principal: c.remarks.principal ?? "",
            },
          ]),
        ),
      );
  }, [d]);

  const canTeacher = can("results", "EDIT");
  const canPrincipal = can("results", "APPROVE");
  const changed = d
    ? d.cards.filter((c) => {
        const x = drafts[c.student.id];
        return (
          x &&
          (x.teacher.trim() !== (c.remarks.teacher ?? "") ||
            x.principal.trim() !== (c.remarks.principal ?? ""))
        );
      })
    : [];

  const save = useMutation({
    mutationFn: () =>
      api.put<{ data: { updated: number } }>("/report-cards/remarks", {
        examId,
        classId,
        entries: changed.map((c) => ({
          studentId: c.student.id,
          ...(canTeacher && {
            teacherRemarks: drafts[c.student.id].teacher.trim() || null,
          }),
          ...(canPrincipal && {
            principalRemarks: drafts[c.student.id].principal.trim() || null,
          }),
        })),
      }),
    onSuccess: (res) => {
      toast.success(`Remarks saved for ${res.data.data.updated} student(s)`);
      qc.invalidateQueries({ queryKey: ["report-cards"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const printUrl = (studentId?: string) => {
    const u = new URLSearchParams({ examId, classId });
    if (studentId) u.set("studentId", studentId);
    else if (sectionId) u.set("sectionId", sectionId);
    window.open(`/print/report-cards?${u.toString()}`, "_blank", "noopener");
  };
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  const card = d?.cards.find((c) => c.student.id === preview);

  return (
    <>
      <PageHeader
        title="Report Cards"
        subtitle="Print-ready cards built from published results. Add teacher and principal remarks, then print one card or a whole class."
        actions={
          d &&
          can("results", "PRINT") && (
            <button
              className="btn-primary"
              onClick={() => printUrl()}
              disabled={d.cards.length === 0}
            >
              <Printer size={16} />
              Print all ({d.cards.length})
            </button>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
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
          Choose an exam and a class.
        </div>
      )}
      {q.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-slate-700">
          {apiMessage(q.error, "Could not load report cards")}
          <div className="mt-3">
            <Link to="/academics/results" className="btn-primary">
              Open Class Results
            </Link>
          </div>
        </div>
      )}

      {d && (
        <>
          <div className="mb-4 flex gap-1 border-b border-line">
            {(
              [
                ["cards", "Cards"],
                ["remarks", "Remarks"],
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

          {tab === "cards" && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    {[
                      "Roll",
                      "Student",
                      "Section",
                      "Total",
                      "%",
                      "Grade",
                      "Position",
                      "Result",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-3">
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {d.cards.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        No students to show.
                      </td>
                    </tr>
                  )}
                  {d.cards.map((c) => (
                    <tr
                      key={c.student.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-3 py-2.5">{c.student.rollNo ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {c.student.fullName}
                        <span className="block text-xs text-slate-500">
                          {c.student.admissionNo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{c.student.section}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {c.totals.obtained}/{c.totals.max}
                      </td>
                      <td className="px-3 py-2.5">
                        {c.totals.percentage === null
                          ? "—"
                          : `${c.totals.percentage}%`}
                      </td>
                      <td className="px-3 py-2.5 font-semibold">
                        {c.totals.grade ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {c.totals.position ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            c.totals.result === "PASS"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700",
                          )}
                        >
                          {c.totals.result === "PASS" ? "Pass" : "Fail"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                            onClick={() => setPreview(c.student.id)}
                            aria-label={`Preview ${c.student.fullName}`}
                          >
                            <Eye size={16} />
                          </button>
                          {can("results", "PRINT") && (
                            <button
                              className="rounded-md p-2 text-brand-700 hover:bg-brand-50"
                              onClick={() => printUrl(c.student.id)}
                              aria-label={`Print ${c.student.fullName}`}
                            >
                              <Printer size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "remarks" && (
            <>
              {!canTeacher && !canPrincipal && (
                <p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
                  You can view remarks but not change them.
                </p>
              )}
              <datalist id="remark-suggestions">
                {SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Roll</th>
                      <th className="px-3 py-3">Student</th>
                      <th className="px-3 py-3">
                        Class teacher's remarks{" "}
                        {canTeacher ? "" : "(view only)"}
                      </th>
                      <th className="px-3 py-3">
                        Principal's remarks {canPrincipal ? "" : "(view only)"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.cards.map((c) => {
                      const x = drafts[c.student.id] ?? {
                        teacher: "",
                        principal: "",
                      };
                      return (
                        <tr
                          key={c.student.id}
                          className="border-b border-line last:border-0"
                        >
                          <td className="px-3 py-2">
                            {c.student.rollNo ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {c.student.fullName}
                            <span className="block text-xs text-slate-500">
                              {c.totals.percentage === null
                                ? ""
                                : `${c.totals.percentage}% · ${c.totals.result === "PASS" ? "Pass" : "Fail"}`}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              list="remark-suggestions"
                              maxLength={300}
                              className="input min-w-64 py-1.5"
                              disabled={!canTeacher}
                              value={x.teacher}
                              onChange={(e) =>
                                set(c.student.id, { teacher: e.target.value })
                              }
                              aria-label={`${c.student.fullName} teacher remarks`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              list="remark-suggestions"
                              maxLength={300}
                              className="input min-w-64 py-1.5"
                              disabled={!canPrincipal}
                              value={x.principal}
                              onChange={(e) =>
                                set(c.student.id, { principal: e.target.value })
                              }
                              aria-label={`${c.student.fullName} principal remarks`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(canTeacher || canPrincipal) && (
                <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <p className="text-sm text-slate-600">
                    {changed.length
                      ? `${changed.length} student(s) changed.`
                      : "Everything is saved."}
                  </p>
                  <button
                    className="btn-primary px-6"
                    disabled={changed.length === 0 || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save remarks
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {preview && d && card && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto max-w-[220mm]">
            <div className="mb-2 flex justify-end gap-2">
              {can("results", "PRINT") && (
                <button
                  className="btn-primary"
                  onClick={() => printUrl(card.student.id)}
                >
                  <Printer size={16} />
                  Print
                </button>
              )}
              <button
                className="btn border border-white/40 bg-white"
                onClick={() => setPreview(null)}
              >
                <X size={16} />
                Close
              </button>
            </div>
            <ReportCardView data={d} card={card} className="shadow-lift" />
          </div>
        </div>
      )}
    </>
  );
}

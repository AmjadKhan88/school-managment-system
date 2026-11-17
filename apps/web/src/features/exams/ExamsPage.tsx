import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, fmtDate, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import {
  EXAM_STATUS_LABEL,
  EXAM_STATUS_STYLE,
  EXAM_TYPE_LABEL,
  ExamRow,
  toIso,
} from "./shared";

interface Scale {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}
interface ClassPick {
  selected: boolean;
  total: string;
  passing: string;
}

export default function ExamsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [dialog, setDialog] = useState<ExamRow | "new" | null>(null);

  const list = useQuery({
    queryKey: ["exams", "list", sessionId],
    queryFn: async () =>
      (
        await api.get<{ data: ExamRow[] }>("/exams", {
          params: { sessionId: sessionId || undefined },
        })
      ).data.data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["exams"] });

  const status = useMutation({
    mutationFn: (v: { id: string; status: "DRAFT" | "PUBLISHED" }) =>
      api.post(`/exams/${v.id}/status`, { status: v.status }),
    onSuccess: (_r, v) => {
      toast.success(
        v.status === "PUBLISHED"
          ? "Exam published"
          : "Exam moved back to draft",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/exams/${id}`),
    onSuccess: () => {
      toast.success("Exam deleted");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Exams"
        subtitle="Create exams for classes. Papers are created from each class's subjects. Set their dates and rooms under Exam Schedule."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-40 font-semibold"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              aria-label="Session"
            >
              <option value="">All sessions</option>
              {user?.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {can("exams", "CREATE") && (
              <button className="btn-primary" onClick={() => setDialog("new")}>
                <Plus size={16} />
                New exam
              </button>
            )}
          </div>
        }
      />

      {list.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {list.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(list.error, "Could not load exams")}
        </div>
      )}
      {list.data?.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No exams yet. Create the first one.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {list.data?.map((e) => (
          <div key={e.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink-950">{e.name}</h2>
                <p className="text-xs text-slate-500">
                  {EXAM_TYPE_LABEL[e.type]} · Session {e.sessionName} ·{" "}
                  {fmtDate(e.startDate)} to {fmtDate(e.endDate)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${EXAM_STATUS_STYLE[e.status]}`}
              >
                {EXAM_STATUS_LABEL[e.status]}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Grading: {e.gradingScaleName ?? "default scale"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.classes.map((c) => (
                <span
                  key={c.classId}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                >
                  {c.className}: {c.passingMarks}/{c.totalMarks}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${e.papers ? (e.scheduled / e.papers) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs text-slate-600">
                {e.scheduled} of {e.papers} papers scheduled
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                to={`/academics/exam-schedule?examId=${e.id}`}
                className="btn border border-slate-300 py-1.5"
              >
                <CalendarClock size={15} />
                Schedule
              </Link>
              {e.status !== "COMPLETED" && can("exams", "EDIT") && (
                <button
                  className="btn border border-slate-300 py-1.5"
                  onClick={() => setDialog(e)}
                >
                  <Pencil size={15} />
                  Edit
                </button>
              )}
              {e.status === "DRAFT" && can("exams", "APPROVE") && (
                <button
                  className="btn border border-emerald-600 py-1.5 text-emerald-700"
                  disabled={status.isPending}
                  onClick={() =>
                    status.mutate({ id: e.id, status: "PUBLISHED" })
                  }
                >
                  Publish
                </button>
              )}
              {e.status === "PUBLISHED" && can("exams", "APPROVE") && (
                <button
                  className="btn border border-amber-500 py-1.5 text-amber-700"
                  disabled={status.isPending}
                  onClick={() => status.mutate({ id: e.id, status: "DRAFT" })}
                >
                  Unpublish
                </button>
              )}
              {e.status === "DRAFT" && can("exams", "DELETE") && (
                <button
                  className="ml-auto rounded-md p-2 text-rose-500 hover:bg-rose-50"
                  aria-label={`Delete ${e.name}`}
                  onClick={() =>
                    window.confirm(
                      `Delete the draft exam "${e.name}" and its schedule?`,
                    ) && remove.mutate(e.id)
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {dialog && (
        <ExamDialog
          exam={dialog === "new" ? null : dialog}
          defaultSession={sessionId || storeSession || ""}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ExamDialog({
  exam,
  defaultSession,
  onClose,
  onSaved,
}: {
  exam: ExamRow | null;
  defaultSession: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const classes = useClasses();
  const scales = useQuery({
    queryKey: ["grading", "scales"],
    queryFn: async () =>
      (await api.get<{ data: Scale[] }>("/grading/scales")).data.data,
  });

  const [f, setF] = useState({
    name: exam?.name ?? "",
    type: exam?.type ?? "MIDTERM",
    sessionId: exam?.sessionId ?? defaultSession,
    startDate: exam ? toIso(exam.startDate) : "",
    endDate: exam ? toIso(exam.endDate) : "",
    gradingScaleId: exam?.gradingScaleId ?? "",
    notes: exam?.notes ?? "",
  });
  const [picks, setPicks] = useState<Record<string, ClassPick>>(() =>
    Object.fromEntries(
      (exam?.classes ?? []).map((c) => [
        c.classId,
        {
          selected: true,
          total: String(c.totalMarks),
          passing: String(c.passingMarks),
        },
      ]),
    ),
  );
  const set =
    (k: keyof typeof f) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));
  const pick = (id: string): ClassPick =>
    picks[id] ?? { selected: false, total: "100", passing: "33" };
  const setPick = (id: string, patch: Partial<ClassPick>) =>
    setPicks((p) => ({ ...p, [id]: { ...pick(id), ...patch } }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        gradingScaleId: f.gradingScaleId || undefined,
        notes: f.notes || undefined,
        classes: Object.entries(picks)
          .filter(([, p]) => p.selected)
          .map(([classId, p]) => ({
            classId,
            totalMarks: Number(p.total),
            passingMarks: Number(p.passing),
          })),
      };
      return exam
        ? api.put<{
            data: { papersCreated: number; classesWithoutSubjects: string[] };
          }>(`/exams/${exam.id}`, body)
        : api.post<{
            data: { papersCreated: number; classesWithoutSubjects: string[] };
          }>("/exams", body);
    },
    onSuccess: (res) => {
      const r = res.data.data;
      const names = (classes.data ?? [])
        .filter((c) => r.classesWithoutSubjects.includes(c.id))
        .map((c) => c.name);
      toast.success(`Exam saved. ${r.papersCreated} paper(s) created.`);
      if (names.length)
        toast(
          `No subjects are mapped to ${names.join(", ")}. Map them under Class-Subject Mapping, then use "Sync subjects" on the schedule.`,
          { duration: 8000 },
        );
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = Object.values(picks).filter((p) => p.selected);
    if (chosen.length === 0) {
      toast.error("Choose at least one class");
      return;
    }
    if (
      chosen.some(
        (p) =>
          !(Number(p.total) >= 1) ||
          Number(p.passing) < 0 ||
          Number(p.passing) > Number(p.total),
      )
    ) {
      toast.error("Check the marks: passing marks cannot exceed total marks");
      return;
    }
    save.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={submit} className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {exam ? `Edit ${exam.name}` : "New exam"}
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Exam name *">
            <input
              required
              className="input mt-1.5 font-normal"
              placeholder="Midterm 2026"
              value={f.name}
              onChange={set("name")}
            />
          </Field>
          <Field label="Exam type *">
            <select
              className="input mt-1.5 font-normal"
              value={f.type}
              onChange={set("type")}
            >
              {Object.entries(EXAM_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Session *">
            <select
              required
              disabled={!!exam}
              className="input mt-1.5 font-normal"
              value={f.sessionId}
              onChange={set("sessionId")}
            >
              <option value="">Select…</option>
              {user?.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grading scale">
            <select
              className="input mt-1.5 font-normal"
              value={f.gradingScaleId}
              onChange={set("gradingScaleId")}
            >
              <option value="">Default scale</option>
              {scales.data
                ?.filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Starts *">
            <input
              required
              type="date"
              className="input mt-1.5 font-normal"
              value={f.startDate}
              onChange={set("startDate")}
            />
          </Field>
          <Field label="Ends *">
            <input
              required
              type="date"
              min={f.startDate}
              className="input mt-1.5 font-normal"
              value={f.endDate}
              onChange={set("endDate")}
            />
          </Field>
        </div>

        <h3 className="mt-5 text-sm font-bold text-ink-950">
          Classes and default marks
        </h3>
        <p className="text-xs text-slate-500">
          These marks are applied to each subject paper. You can change them per
          subject on the schedule.
        </p>
        <div className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {classes.data?.map((c) => {
            const p = pick(c.id);
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
              >
                <label className="flex min-w-32 items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={p.selected}
                    onChange={(e) =>
                      setPick(c.id, { selected: e.target.checked })
                    }
                  />
                  {c.name}
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  Total
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    disabled={!p.selected}
                    className="input w-20 py-1"
                    value={p.total}
                    onChange={(e) => setPick(c.id, { total: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  Passing
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    disabled={!p.selected}
                    className="input w-20 py-1"
                    value={p.passing}
                    onChange={(e) => setPick(c.id, { passing: e.target.value })}
                  />
                </label>
              </div>
            );
          })}
        </div>

        <Field label="Notes" className="mt-4">
          <input
            className="input mt-1.5 font-normal"
            value={f.notes}
            onChange={set("notes")}
          />
        </Field>

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
            {exam ? "Save changes" : "Create exam"}
          </button>
        </div>
      </form>
    </div>
  );
}

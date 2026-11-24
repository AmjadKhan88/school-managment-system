import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { Field, fmtDate, isoDate, todayIso } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { FilePicker, fmtSize, openFile, Track, TRACK } from "./shared";

interface Sub {
  id: string;
  status: "SUBMITTED" | "CHECKED" | "REDO";
  late: boolean;
  note: string | null;
  submittedAt: string;
  onBehalf: boolean;
  marks: number | null;
  feedback: string | null;
  files: { id: string; fileName: string; sizeBytes: number }[];
}
interface Row {
  studentId: string;
  rollNo: number | null;
  admissionNo: string;
  fullName: string;
  track: Track;
  submission: Sub | null;
}
interface Detail {
  id: string;
  homeworkNo: string;
  title: string;
  description: string | null;
  assignedOn: string;
  dueDate: string;
  maxMarks: number | null;
  allowLate: boolean;
  status: "ACTIVE" | "CANCELLED";
  cancelReason: string | null;
  className: string;
  sectionName: string;
  subject: string;
  teacher: string;
  attachments: { id: string; fileName: string; sizeBytes: number }[];
  summary: {
    total: number;
    pending: number;
    overdue: number;
    submitted: number;
    late: number;
    checked: number;
    redo: number;
    done: number;
    percent: number;
  };
  rows: Row[];
  canModify: boolean;
}

export default function HomeworkDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [filter, setFilter] = useState<"ALL" | Track>("ALL");
  const [edit, setEdit] = useState(false);
  const [review, setReview] = useState<Row | null>(null);
  const [record, setRecord] = useState<Row | null>(null);
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: ["homework", "one", id],
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/homework/${id}`)).data.data,
  });
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["homework"] });

  const cancel = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/homework/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success("Homework cancelled");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const reset = useMutation({
    mutationFn: (studentId: string) =>
      api.post(`/homework/${id}/submissions/${studentId}/reset`),
    onSuccess: () => {
      toast.success("Submission removed");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const removeAttachment = useMutation({
    mutationFn: (att: string) => api.delete(`/homework/attachments/${att}`),
    onSuccess: () => {
      toast.success("Attachment removed");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files).forEach((f) => body.append("files", f));
    try {
      await api.post(`/homework/${id}/attachments`, body);
      toast.success("Attachment added");
      refresh();
    } catch (e) {
      toast.error(apiMessage(e));
    }
  };
  const askCancel = () => {
    const r = window.prompt("Why is this homework being cancelled?");
    if (r && r.trim().length >= 3) cancel.mutate(r.trim());
    else if (r !== null)
      toast.error("Please give a reason of at least 3 characters");
  };
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/homework/${id}/export`,
        {},
        `homework-${d?.homeworkNo}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (q.isLoading)
    return <Loader2 className="mx-auto mt-20 animate-spin text-slate-400" />;
  if (q.isError || !d)
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        {apiMessage(q.error, "Homework not found")}
        <div className="mt-4">
          <Link to="/academics/homework" className="btn-primary">
            Back to homework
          </Link>
        </div>
      </div>
    );

  const s = d.summary;
  const rows = d.rows.filter((r) => filter === "ALL" || r.track === filter);
  const active = d.status === "ACTIVE";

  return (
    <>
      <Link
        to="/academics/homework"
        className="no-print mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={15} />
        All homework
      </Link>
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-ink-950">{d.title}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {d.homeworkNo} · {d.className} {d.sectionName} · {d.subject} ·{" "}
              {d.teacher}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Assigned {fmtDate(d.assignedOn)} · Due{" "}
              <strong>{fmtDate(d.dueDate)}</strong>
              {d.maxMarks ? ` · ${d.maxMarks} marks` : ""}
              {d.allowLate ? "" : " · no late work"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("homework", "EXPORT") && (
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
            {d.canModify && active && can("homework", "EDIT") && (
              <button
                className="btn border border-slate-300"
                onClick={() => setEdit(true)}
              >
                <Pencil size={15} />
                Edit
              </button>
            )}
            {d.canModify && active && can("homework", "EDIT") && (
              <button
                className="btn border border-rose-300 text-rose-600"
                onClick={askCancel}
                disabled={cancel.isPending}
              >
                Cancel homework
              </button>
            )}
          </div>
        </div>
        {!active && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            Cancelled{d.cancelReason ? `: ${d.cancelReason}` : ""}.
          </p>
        )}
        {d.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm">{d.description}</p>
        )}
        <div className="mt-4">
          <h3 className="text-sm font-bold text-ink-950">Attachments</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {d.attachments.length === 0 && (
              <li className="text-sm text-slate-500">None.</li>
            )}
            {d.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs font-semibold"
              >
                <button
                  className="flex items-center gap-1 hover:text-brand-700"
                  onClick={() => openFile(`/homework/attachments/${a.id}`)}
                >
                  <Paperclip size={12} />
                  {a.fileName}{" "}
                  <span className="font-normal text-slate-400">
                    {fmtSize(a.sizeBytes)}
                  </span>
                </button>
                {d.canModify && active && can("homework", "EDIT") && (
                  <button
                    className="rounded-full p-1 text-slate-400 hover:text-rose-600"
                    aria-label={`Remove ${a.fileName}`}
                    onClick={() =>
                      window.confirm(`Remove ${a.fileName}?`) &&
                      removeAttachment.mutate(a.id)
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
            {d.canModify &&
              active &&
              can("homework", "EDIT") &&
              d.attachments.length < 5 && (
                <li>
                  <label className="cursor-pointer rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                    + Add
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        addAttachments(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </li>
              )}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(
          [
            ["Students", s.total, "ALL"],
            ["Handed in", s.done, null],
            ["Checked", s.checked, "CHECKED"],
            ["Late", s.late, "LATE"],
            ["Redo", s.redo, "REDO"],
            ["Not submitted", s.pending, "PENDING"],
            ["Overdue", s.overdue, "OVERDUE"],
          ] as [string, number, Track | "ALL" | null][]
        ).map(([l, v, f]) => (
          <button
            key={l}
            disabled={!f}
            onClick={() => f && setFilter(filter === f ? "ALL" : f)}
            className={cn(
              "card p-3 text-left",
              f && filter === f && "ring-2 ring-brand-500",
            )}
          >
            <p className="text-xs font-semibold text-slate-500">{l}</p>
            <p className="mt-0.5 text-xl font-extrabold text-ink-950">
              {v}
              {l === "Handed in" ? (
                <span className="ml-1 text-sm font-semibold text-slate-400">
                  {s.percent}%
                </span>
              ) : null}
            </p>
          </button>
        ))}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Roll",
                "Student",
                "Status",
                "Handed in",
                "Work",
                "Marks and feedback",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No students match.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.studentId}
                className="border-b border-line align-top last:border-0"
              >
                <td className="px-4 py-3">{r.rollNo ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.admissionNo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      TRACK[r.track][1],
                    )}
                  >
                    {TRACK[r.track][0]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.submission ? fmtDate(r.submission.submittedAt) : "—"}
                  {r.submission?.onBehalf && (
                    <span className="block text-[11px] text-slate-400">
                      recorded by teacher
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.submission?.note && (
                    <p className="max-w-xs whitespace-pre-wrap text-xs">
                      {r.submission.note}
                    </p>
                  )}
                  <ul className="mt-0.5 space-y-0.5">
                    {r.submission?.files.map((f) => (
                      <li key={f.id}>
                        <button
                          className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                          onClick={() =>
                            openFile(`/homework/submission-files/${f.id}`)
                          }
                        >
                          <Paperclip size={11} />
                          {f.fileName}
                        </button>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.submission?.marks !== null &&
                    r.submission?.marks !== undefined && (
                      <strong>
                        {r.submission.marks}
                        {d.maxMarks ? ` / ${d.maxMarks}` : ""}
                      </strong>
                    )}
                  {r.submission?.feedback && (
                    <p className="max-w-xs text-slate-600">
                      {r.submission.feedback}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {d.canModify && active && can("homework", "EDIT") && (
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {!r.submission && (
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          onClick={() => setRecord(r)}
                        >
                          Record
                        </button>
                      )}
                      {r.submission && (
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setReview(r)}
                        >
                          {r.submission.status === "SUBMITTED"
                            ? "Review"
                            : "Re-review"}
                        </button>
                      )}
                      {r.submission?.onBehalf &&
                        r.submission.status === "SUBMITTED" && (
                          <button
                            className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={() =>
                              window.confirm(
                                `Remove the recorded submission of ${r.fullName}?`,
                              ) && reset.mutate(r.studentId)
                            }
                          >
                            Remove
                          </button>
                        )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <EditDialog
          d={d}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            refresh();
          }}
        />
      )}
      {review && (
        <ReviewDialog
          d={d}
          row={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            refresh();
          }}
        />
      )}
      {record && (
        <RecordDialog
          d={d}
          row={record}
          onClose={() => setRecord(null)}
          onSaved={() => {
            setRecord(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function Modal({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function EditDialog({
  d,
  onClose,
  onSaved,
}: {
  d: Detail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: d.title,
    description: d.description ?? "",
    dueDate: isoDate(d.dueDate),
    maxMarks: d.maxMarks ? String(d.maxMarks) : "",
    allowLate: d.allowLate,
  });
  const save = useMutation({
    mutationFn: () =>
      api.put(`/homework/${d.id}`, {
        title: f.title,
        description: f.description,
        dueDate: f.dueDate,
        maxMarks: f.maxMarks ? Number(f.maxMarks) : null,
        allowLate: f.allowLate,
      }),
    onSuccess: () => {
      toast.success("Homework updated");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal title="Edit homework" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-4 space-y-4"
      >
        <Field label="Title *">
          <input
            required
            minLength={3}
            className="input mt-1.5 font-normal"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
        </Field>
        <Field label="Instructions">
          <textarea
            rows={3}
            className="input mt-1.5 font-normal"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Due date *">
            <input
              required
              type="date"
              min={isoDate(d.assignedOn)}
              className="input mt-1.5 font-normal"
              value={f.dueDate}
              onChange={(e) => setF({ ...f, dueDate: e.target.value })}
            />
          </Field>
          <Field label="Maximum marks">
            <input
              type="number"
              min="1"
              className="input mt-1.5 font-normal"
              value={f.maxMarks}
              onChange={(e) => setF({ ...f, maxMarks: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={f.allowLate}
            onChange={(e) => setF({ ...f, allowLate: e.target.checked })}
          />
          Accept late submissions
        </label>
        <p className="text-xs text-slate-500">
          Changing the due date re-checks which submissions count as late.
        </p>
        <div className="flex justify-end gap-2">
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
    </Modal>
  );
}

function ReviewDialog({
  d,
  row,
  onClose,
  onSaved,
}: {
  d: Detail;
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const s = row.submission!;
  const [status, setStatus] = useState<"CHECKED" | "REDO">(
    s.status === "REDO" ? "REDO" : "CHECKED",
  );
  const [marks, setMarks] = useState(s.marks !== null ? String(s.marks) : "");
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const save = useMutation({
    mutationFn: () =>
      api.put(`/homework/${d.id}/submissions/${row.studentId}/review`, {
        status,
        marks: status === "CHECKED" && marks !== "" ? Number(marks) : null,
        feedback: feedback || null,
      }),
    onSuccess: () => {
      toast.success(
        status === "CHECKED" ? "Marked as checked" : "Sent back for a redo",
      );
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const bad =
    (status === "REDO" && !feedback.trim()) ||
    (marks !== "" && d.maxMarks !== null && Number(marks) > d.maxMarks);
  return (
    <Modal
      title="Review work"
      sub={`${row.fullName} · ${d.title}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-4 space-y-4"
      >
        <div role="group" className="flex gap-2">
          {(["CHECKED", "REDO"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={status === k}
              onClick={() => setStatus(k)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold",
                status === k
                  ? k === "CHECKED"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-slate-200 text-slate-500",
              )}
            >
              {k === "CHECKED" ? "Checked" : "Needs a redo"}
            </button>
          ))}
        </div>
        {status === "CHECKED" && d.maxMarks !== null && (
          <Field label={`Marks (out of ${d.maxMarks})`}>
            <input
              type="number"
              min="0"
              max={d.maxMarks}
              step="0.5"
              className="input mt-1.5 font-normal"
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
            />
          </Field>
        )}
        <Field label={status === "REDO" ? "What to redo *" : "Feedback"}>
          <textarea
            rows={3}
            className="input mt-1.5 font-normal"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending || bad}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecordDialog({
  d,
  row,
  onClose,
  onSaved,
}: {
  d: Detail;
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ submittedOn: todayIso(), note: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.note.trim() && files.length === 0) {
      toast.error("Add a note or attach a file");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("submittedOn", f.submittedOn);
      body.append("note", f.note);
      files.forEach((x) => body.append("files", x));
      await api.post(
        `/homework/${d.id}/submissions/${row.studentId}/record`,
        body,
      );
      toast.success("Submission recorded");
      onSaved();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Record a submission"
      sub={`${row.fullName} handed in on paper, or has no login yet`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Handed in on *">
          <input
            required
            type="date"
            min={isoDate(d.assignedOn)}
            max={todayIso()}
            className="input mt-1.5 font-normal"
            value={f.submittedOn}
            onChange={(e) => setF({ ...f, submittedOn: e.target.value })}
          />
        </Field>
        <Field label="Note">
          <textarea
            rows={2}
            className="input mt-1.5 font-normal"
            placeholder="For example: notebook checked in class"
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
          />
        </Field>
        <div>
          <p className="text-sm font-bold text-ink-950">Files (optional)</p>
          <FilePicker files={files} onChange={setFiles} />
        </div>
        <p className="text-xs text-slate-500">
          If the date is after the due date it will count as late.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />}Record
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { FilePicker, fmtSize, openFile, Track, TRACK } from "./shared";

interface Child {
  studentId: string;
  fullName: string;
  className: string;
  sectionName: string;
  rollNo: number | null;
}
interface Item {
  id: string;
  homeworkNo: string;
  title: string;
  subject: string;
  teacher: string;
  dueDate: string;
  maxMarks: number | null;
  attachments: number;
  track: Track;
  marks: number | null;
}
interface Detail {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  teacher: string;
  assignedOn: string;
  dueDate: string;
  maxMarks: number | null;
  allowLate: boolean;
  attachments: { id: string; fileName: string; sizeBytes: number }[];
  track: Track;
  cannotSubmitBecause: string | null;
  submission: {
    status: string;
    late: boolean;
    note: string | null;
    submittedAt: string;
    marks: number | null;
    feedback: string | null;
    files: { id: string; fileName: string; sizeBytes: number }[];
  } | null;
}

export default function PortalHomeworkPage() {
  const [studentId, setStudentId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const kids = useQuery({
    queryKey: ["homework-portal", "children"],
    queryFn: async () =>
      (await api.get<{ data: Child[] }>("/homework-portal/children")).data.data,
  });
  useEffect(() => {
    if (!studentId && kids.data?.length) setStudentId(kids.data[0].studentId);
  }, [kids.data, studentId]);

  const list = useQuery({
    queryKey: ["homework-portal", "list", studentId],
    enabled: !!studentId,
    queryFn: async () =>
      (
        await api.get<{ data: Item[] }>("/homework-portal/list", {
          params: { studentId },
        })
      ).data.data,
  });

  return (
    <>
      <PageHeader
        title="Homework"
        subtitle="See what has been set, hand in your work, and read your teacher's feedback."
      />
      {kids.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {kids.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(kids.error, "Could not load")}
        </div>
      )}
      {kids.data?.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No student is linked to this login, or the student has no class this
          session.
        </div>
      )}
      {kids.data && kids.data.length > 1 && (
        <div className="card mb-4 p-4">
          <Field label="Student">
            <select
              className="input mt-1.5 max-w-xs font-normal"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {kids.data.map((k) => (
                <option key={k.studentId} value={k.studentId}>
                  {k.fullName} ({k.className} {k.sectionName})
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {list.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {list.data?.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No homework has been set yet.
        </div>
      )}
      <div className="grid gap-3">
        {list.data?.map((h) => (
          <button
            key={h.id}
            onClick={() => setOpenId(h.id)}
            className="card flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-slate-50/60"
          >
            <div>
              <p className="font-bold text-ink-950">{h.title}</p>
              <p className="text-xs text-slate-500">
                {h.subject} · {h.teacher} · due {fmtDate(h.dueDate)}
                {h.attachments
                  ? ` · ${h.attachments} file${h.attachments === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  TRACK[h.track][1],
                )}
              >
                {TRACK[h.track][0]}
              </span>
              {h.marks !== null && (
                <p className="mt-1 text-xs font-semibold">
                  {h.marks}
                  {h.maxMarks ? ` / ${h.maxMarks}` : ""} marks
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      {openId && studentId && (
        <HomeworkDialog
          id={openId}
          studentId={studentId}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function HomeworkDialog({
  id,
  studentId,
  onClose,
}: {
  id: string;
  studentId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const q = useQuery({
    queryKey: ["homework-portal", "one", id, studentId],
    queryFn: async () =>
      (
        await api.get<{ data: Detail }>(`/homework-portal/${id}`, {
          params: { studentId },
        })
      ).data.data,
  });
  const d = q.data;
  useEffect(() => {
    if (d?.submission?.note) setNote(d.submission.note);
  }, [d]);
  const refresh = useMutation({
    mutationFn: async () => undefined,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homework-portal"] }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() && files.length === 0) {
      toast.error("Add a note or attach a file");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("studentId", studentId);
      body.append("note", note);
      files.forEach((f) => body.append("files", f));
      const res = await api.post<{ data: { late: boolean } }>(
        `/homework-portal/${id}/submit`,
        body,
      );
      toast.success(
        res.data.data.late ? "Handed in (marked late)" : "Handed in",
      );
      setFiles([]);
      refresh.mutate();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{d?.title ?? "Homework"}</h2>
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
            {apiMessage(q.error, "Could not load")}
          </p>
        )}
        {d && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {d.subject} · {d.teacher} · due{" "}
              <strong>{fmtDate(d.dueDate)}</strong>
              {d.maxMarks ? ` · ${d.maxMarks} marks` : ""}
            </p>
            {d.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm">
                {d.description}
              </p>
            )}
            {d.attachments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {d.attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold hover:text-brand-700"
                      onClick={() =>
                        openFile(`/homework-portal/attachments/${a.id}`, {
                          studentId,
                        })
                      }
                    >
                      <Paperclip size={12} />
                      {a.fileName}{" "}
                      <span className="font-normal text-slate-400">
                        {fmtSize(a.sizeBytes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {d.submission && (
              <div className="mt-4 rounded-xl border border-line p-3 text-sm">
                <p className="flex items-center justify-between">
                  <span className="font-bold">Your work</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      TRACK[d.track][1],
                    )}
                  >
                    {TRACK[d.track][0]}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Handed in {fmtDate(d.submission.submittedAt)}
                </p>
                {d.submission.files.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {d.submission.files.map((f) => (
                      <li key={f.id}>
                        <button
                          className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                          onClick={() =>
                            openFile(`/homework-portal/files/${f.id}`, {
                              studentId,
                            })
                          }
                        >
                          <Paperclip size={11} />
                          {f.fileName}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {d.submission.marks !== null && (
                  <p className="mt-2 font-bold">
                    Marks: {d.submission.marks}
                    {d.maxMarks ? ` / ${d.maxMarks}` : ""}
                  </p>
                )}
                {d.submission.feedback && (
                  <p
                    className={cn(
                      "mt-2 rounded-lg p-2",
                      d.submission.status === "REDO"
                        ? "bg-orange-50 text-orange-800"
                        : "bg-emerald-50 text-emerald-800",
                    )}
                  >
                    <strong>Teacher: </strong>
                    {d.submission.feedback}
                  </p>
                )}
              </div>
            )}

            {d.cannotSubmitBecause ? (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {d.cannotSubmitBecause}.
              </p>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3">
                <h3 className="text-sm font-bold text-ink-950">
                  {d.submission ? "Hand in again" : "Hand in your work"}
                </h3>
                {d.submission && (
                  <p className="text-xs text-slate-500">
                    Handing in again replaces the files you sent before.
                  </p>
                )}
                <Field label="Note">
                  <textarea
                    rows={2}
                    className="input mt-1.5 font-normal"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <FilePicker files={files} onChange={setFiles} />
                <button className="btn-primary" disabled={saving}>
                  {saving && <Loader2 size={15} className="animate-spin" />}Hand
                  in
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

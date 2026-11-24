import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import {
  Field,
  fmtDate,
  useClasses,
  useDebounced,
} from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { FilePicker } from "./shared";

interface Row {
  id: string;
  homeworkNo: string;
  title: string;
  status: "ACTIVE" | "CANCELLED";
  dueDate: string;
  overdue: boolean;
  class: string;
  section: string;
  subject: string;
  teacher: string;
  total: number;
  done: number;
  checked: number;
  redo: number;
  percent: number;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface Combo {
  classId: string;
  className: string;
  level: number;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  teacher: { id: string; name: string } | null;
}
interface Options {
  restricted: boolean;
  combos: Combo[];
  teachers: { id: string; employeeNo: string; fullName: string }[];
}

export default function HomeworkPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);
  const classes = useClasses();

  const params = {
    sessionId: sessionId || undefined,
    q: dq || undefined,
    classId: classId || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["homework", "list", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/homework", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <>
      <PageHeader
        title="Homework and Assignments"
        subtitle="Assign homework to a class and section, then track who has handed it in and give feedback."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-36 font-semibold"
              value={sessionId}
              onChange={(e) => reset(setSessionId)(e.target.value)}
              aria-label="Session"
            >
              <option value="">Active session</option>
              {user?.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {can("homework", "CREATE") && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} />
                New homework
              </button>
            )}
          </div>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Title or number"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={classId}
          onChange={(e) => reset(setClassId)(e.target.value)}
          aria-label="Class"
        >
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Homework",
                "Class",
                "Subject",
                "Teacher",
                "Due",
                "Handed in",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {list.isError && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load homework")}
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No homework matches these filters.
                </td>
              </tr>
            )}
            {d?.items.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "border-b border-line last:border-0 hover:bg-slate-50/60",
                  r.status === "CANCELLED" && "text-slate-400",
                )}
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/academics/homework/${r.id}`}
                    className="font-semibold hover:text-brand-700"
                  >
                    {r.title}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {r.homeworkNo}
                    {r.status === "CANCELLED" ? " · cancelled" : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.class} {r.section}
                </td>
                <td className="px-4 py-3">{r.subject}</td>
                <td className="px-4 py-3">{r.teacher}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.dueDate)}
                  {r.overdue && (
                    <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                      Past due
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${r.percent}%` }}
                      />
                    </div>
                    <span className="text-xs">
                      {r.done}/{r.total}
                    </span>
                  </div>
                  {(r.checked > 0 || r.redo > 0) && (
                    <span className="text-[11px] text-slate-500">
                      {r.checked} checked{r.redo ? ` · ${r.redo} redo` : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && d.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(d.page - 1) * d.pageSize + 1}–
              {Math.min(d.page * d.pageSize, d.total)} of {d.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2">
                Page {page} of {pages}
              </span>
              <button
                className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {adding && (
        <NewHomework
          sessionId={sessionId || storeSession || ""}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["homework"] });
          }}
        />
      )}
    </>
  );
}

function NewHomework({
  sessionId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const opts = useQuery({
    queryKey: ["homework", "options", sessionId],
    enabled: !!sessionId,
    queryFn: async () =>
      (
        await api.get<{ data: Options }>("/homework/options", {
          params: { sessionId },
        })
      ).data.data,
  });
  const [classId, setClassId] = useState("");
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [f, setF] = useState({
    title: "",
    description: "",
    assignedOn: localToday(),
    dueDate: "",
    maxMarks: "",
    allowLate: true,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const combos = opts.data?.combos ?? [];

  const classes = useMemo(
    () =>
      [...new Map(combos.map((c) => [c.classId, c])).values()].sort(
        (a, b) => a.level - b.level,
      ),
    [combos],
  );
  const sections = useMemo(
    () => [
      ...new Map(
        combos
          .filter((c) => c.classId === classId)
          .map((c) => [c.sectionId, c]),
      ).values(),
    ],
    [combos, classId],
  );
  // Only subjects every chosen section offers can be assigned together.
  const subjects = useMemo(() => {
    const inClass = combos.filter(
      (c) =>
        c.classId === classId &&
        (sectionIds.length === 0 || sectionIds.includes(c.sectionId)),
    );
    const ids = sectionIds.length
      ? sectionIds
      : sections.map((s) => s.sectionId);
    return [
      ...new Map(inClass.map((c) => [c.subjectId, c.subjectName])).entries(),
    ]
      .filter(
        ([sid]) =>
          ids.every((s) =>
            inClass.some((c) => c.sectionId === s && c.subjectId === sid),
          ) || sectionIds.length === 0,
      )
      .map(([id, name]) => ({ id, name }));
  }, [combos, classId, sectionIds, sections]);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (id: string) => {
    setSectionIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
    setSubjectId("");
  };
  const missingTeacher =
    !opts.data?.restricted &&
    !employeeId &&
    subjectId &&
    sectionIds.some(
      (sid) =>
        !combos.find((c) => c.sectionId === sid && c.subjectId === subjectId)
          ?.teacher,
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sectionIds.length === 0) {
      toast.error("Choose at least one section");
      return;
    }
    if (f.dueDate < f.assignedOn) {
      toast.error("The due date is before the assigned date");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("sessionId", sessionId);
      body.append("sectionIds", JSON.stringify(sectionIds));
      body.append("subjectId", subjectId);
      if (employeeId) body.append("employeeId", employeeId);
      body.append("title", f.title);
      body.append("description", f.description);
      body.append("assignedOn", f.assignedOn);
      body.append("dueDate", f.dueDate);
      body.append("maxMarks", f.maxMarks);
      body.append("allowLate", String(f.allowLate));
      files.forEach((file) => body.append("files", file));
      const res = await api.post<{
        data: { created: { homeworkNo: string }[] };
      }>("/homework", body);
      toast.success(
        `Homework assigned (${res.data.data.created.map((c) => c.homeworkNo).join(", ")})`,
      );
      onSaved();
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
      <form onSubmit={submit} className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">New homework</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {opts.isLoading && (
          <Loader2 className="mx-auto my-8 animate-spin text-slate-400" />
        )}
        {opts.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(opts.error, "Could not load your classes")}
          </p>
        )}
        {opts.data && combos.length === 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {opts.data.restricted
              ? "You are not assigned to teach any subject this session, so there is nothing to assign yet. Ask for a Teacher Assignment."
              : "No classes with mapped subjects were found."}
          </p>
        )}
        {opts.data && combos.length > 0 && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Class *">
                <select
                  required
                  className="input mt-1.5 font-normal"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setSectionIds([]);
                    setSubjectId("");
                  }}
                >
                  <option value="">Select…</option>
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.className}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subject *">
                <select
                  required
                  className="input mt-1.5 font-normal"
                  value={subjectId}
                  disabled={!classId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {classId && (
              <div className="mt-4">
                <p className="text-sm font-bold text-ink-950">Sections *</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {sections.map((s) => (
                    <label
                      key={s.sectionId}
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={sectionIds.includes(s.sectionId)}
                        onChange={() => toggle(s.sectionId)}
                      />
                      Section {s.sectionName}
                    </label>
                  ))}
                </div>
                {sectionIds.length > 1 && (
                  <p className="mt-1 text-xs text-slate-500">
                    One homework is created for each section, so each is tracked
                    separately.
                  </p>
                )}
              </div>
            )}
            {!opts.data.restricted && (
              <Field label="Teacher" className="mt-4">
                <select
                  className="input mt-1.5 font-normal"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">The teacher assigned to each section</option>
                  {opts.data.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} ({t.employeeNo})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {missingTeacher && (
              <p className="mt-2 text-xs text-amber-700">
                A chosen section has no teacher assigned for this subject.
                Choose a teacher above.
              </p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Title *" className="sm:col-span-2">
                <input
                  required
                  minLength={3}
                  className="input mt-1.5 font-normal"
                  placeholder="Chapter 4 exercises"
                  value={f.title}
                  onChange={set("title")}
                />
              </Field>
              <Field label="Instructions" className="sm:col-span-2">
                <textarea
                  rows={3}
                  className="input mt-1.5 font-normal"
                  value={f.description}
                  onChange={set("description")}
                />
              </Field>
              <Field label="Assigned on *">
                <input
                  required
                  type="date"
                  className="input mt-1.5 font-normal"
                  value={f.assignedOn}
                  onChange={set("assignedOn")}
                />
              </Field>
              <Field label="Due date *">
                <input
                  required
                  type="date"
                  min={f.assignedOn}
                  className="input mt-1.5 font-normal"
                  value={f.dueDate}
                  onChange={set("dueDate")}
                />
              </Field>
              <Field label="Maximum marks (optional)">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  className="input mt-1.5 font-normal"
                  value={f.maxMarks}
                  onChange={set("maxMarks")}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={f.allowLate}
                  onChange={(e) =>
                    setF((s) => ({ ...s, allowLate: e.target.checked }))
                  }
                />
                Accept late submissions
              </label>
            </div>
            <div className="mt-4">
              <p className="text-sm font-bold text-ink-950">
                Attachments (optional)
              </p>
              <FilePicker files={files} onChange={setFiles} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={saving || !!missingTeacher}
              >
                {saving && <Loader2 size={15} className="animate-spin" />}Assign
                homework
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

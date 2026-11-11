import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  MoveRight,
  Search,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Field, fmtDate, todayIso, useClasses, useDebounced } from "./shared";

interface Candidate {
  studentId: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  rollNo: number | null;
  class: { id: string; name: string };
  section: { id: string; name: string };
}
interface SectionOption {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
}
interface Place {
  className: string;
  section: string;
  rollNo: number | null;
}
interface HistoryRow {
  id: string;
  type: "INTERNAL" | "OUT";
  transferDate: string;
  reason: string | null;
  destinationSchool: string | null;
  certificateNo: string | null;
  session: string;
  student: { id: string; admissionNo: string; fullName: string };
  from: Place;
  to: Place | null;
}

const place = (p: Place | null) =>
  p ? `${p.className} / ${p.section}${p.rollNo ? ` / #${p.rollNo}` : ""}` : "—";

export default function TransferPage() {
  const [tab, setTab] = useState<"transfer" | "history">("transfer");
  return (
    <>
      <PageHeader
        title="Student Transfer"
        subtitle="Move a student to another class or section, or transfer them out of the school. Every transfer is logged."
      />
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ["transfer", "Transfer student"],
            ["history", "History"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "transfer" ? <TransferTab /> : <HistoryTab />}
    </>
  );
}

function TransferTab() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { sessionId, user } = useAuth();
  const sessionName = user?.sessions.find((s) => s.id === sessionId)?.name;

  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const [student, setStudent] = useState<Candidate | null>(null);
  const [mode, setMode] = useState<"INTERNAL" | "OUT">("INTERNAL");
  const [toClassId, setToClassId] = useState("");
  const [toSectionId, setToSectionId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [transferDate, setTransferDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");

  const classes = useClasses();
  const search = useQuery({
    queryKey: ["transfers", "search", dq, sessionId],
    enabled: dq.length >= 2 && !!sessionId && !student,
    queryFn: async () =>
      (
        await api.get<{ data: Candidate[] }>("/transfers/search", {
          params: { q: dq, sessionId },
        })
      ).data.data,
  });
  const sections = useQuery({
    queryKey: ["/academics/sections", toClassId],
    enabled: !!toClassId,
    queryFn: async () =>
      (
        await api.get<{ data: SectionOption[] }>("/academics/sections", {
          params: { classId: toClassId },
        })
      ).data.data,
  });

  const reset = () => {
    setStudent(null);
    setQ("");
    setToClassId("");
    setToSectionId("");
    setRollNo("");
    setReason("");
    setDestination("");
    setTransferDate(todayIso());
  };
  const done = () => {
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["transfers"] });
    reset();
  };

  const move = useMutation({
    mutationFn: () =>
      api.post("/transfers/internal", {
        studentId: student!.studentId,
        sessionId,
        toClassId,
        toSectionId,
        rollNo: rollNo || undefined,
        transferDate,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success("Student moved");
      done();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const out = useMutation({
    mutationFn: () =>
      api.post<{ data: { certificateNo: string } }>("/transfers/out", {
        studentId: student!.studentId,
        sessionId,
        transferDate,
        reason: reason || undefined,
        destinationSchool: destination || undefined,
      }),
    onSuccess: (res) => {
      toast.success(
        `Transferred out. Certificate no ${res.data.data.certificateNo}`,
      );
      done();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (!can("students", "EDIT")) {
    return (
      <div className="card p-8 text-sm text-slate-600">
        You do not have permission to transfer students. You can still view the
        History tab.
      </div>
    );
  }
  if (!sessionId) {
    return (
      <div className="card p-8 text-sm text-slate-600">
        Create and select an academic session first.
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (mode === "INTERNAL") {
      move.mutate();
    } else if (
      window.confirm(
        `Transfer ${student.fullName} out of the school?\n\nTheir status becomes Transferred and a leaving certificate number is issued. Their records are kept.`,
      )
    ) {
      out.mutate();
    }
  };
  const busy = move.isPending || out.isPending;

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="card h-fit p-5">
        <h2 className="text-base font-bold text-ink-950">
          1. Find the student
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Searching students enrolled in session {sessionName}.
        </p>
        {student ? (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="font-bold text-ink-950">{student.fullName}</p>
            <p className="text-xs text-slate-600">
              {student.admissionNo} · Father: {student.fatherName}
            </p>
            <p className="mt-2 text-sm">
              Currently:{" "}
              <strong>
                {student.class.name} / {student.section.name}
              </strong>
              {student.rollNo ? ` / #${student.rollNo}` : ""}
            </p>
            <button
              className="mt-3 text-xs font-semibold text-brand-700 hover:underline"
              onClick={reset}
            >
              Choose a different student
            </button>
          </div>
        ) : (
          <>
            <div className="relative mt-4">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="input pl-9"
                placeholder="Name or admission number"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
            </div>
            <ul className="mt-3 space-y-1">
              {dq.length < 2 && (
                <li className="px-1 text-xs text-slate-500">
                  Type at least 2 characters.
                </li>
              )}
              {search.isFetching && (
                <li className="px-1">
                  <Loader2 size={16} className="animate-spin text-slate-400" />
                </li>
              )}
              {search.data?.length === 0 && (
                <li className="px-1 text-sm text-slate-500">
                  No enrolled student found.
                </li>
              )}
              {search.data?.map((c) => (
                <li key={c.studentId}>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => setStudent(c)}
                  >
                    <span className="font-semibold">{c.fullName}</span>
                    <span className="block text-xs text-slate-500">
                      {c.admissionNo} · {c.class.name} / {c.section.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form onSubmit={submit} className="card p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink-950">
          2. Choose the transfer
        </h2>
        {!student ? (
          <p className="mt-4 text-sm text-slate-500">Select a student first.</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["INTERNAL", "Move to another class or section", MoveRight],
                  ["OUT", "Transfer out of school", LogOut],
                ] as const
              ).map(([k, label, Icon]) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${mode === k ? "border-brand-500 bg-brand-50" : "border-line hover:bg-slate-50"}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="h-4 w-4"
                    checked={mode === k}
                    onChange={() => setMode(k)}
                  />
                  <Icon size={16} />
                  {label}
                </label>
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {mode === "INTERNAL" && (
                <>
                  <Field label="New class *">
                    <select
                      required
                      className="input mt-1.5 font-normal"
                      value={toClassId}
                      onChange={(e) => {
                        setToClassId(e.target.value);
                        setToSectionId("");
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
                  <Field label="New section *">
                    <select
                      required
                      className="input mt-1.5 font-normal"
                      disabled={!toClassId}
                      value={toSectionId}
                      onChange={(e) => setToSectionId(e.target.value)}
                    >
                      <option value="">
                        {toClassId ? "Select…" : "Choose a class first"}
                      </option>
                      {sections.data
                        ?.filter((s) => s.isActive)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (capacity {s.capacity})
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Roll number (blank = next free)">
                    <input
                      inputMode="numeric"
                      pattern="\d*"
                      className="input mt-1.5 font-normal"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                    />
                  </Field>
                </>
              )}
              {mode === "OUT" && (
                <Field label="Destination school" className="sm:col-span-2">
                  <input
                    className="input mt-1.5 font-normal"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Transfer date *">
                <input
                  required
                  type="date"
                  className="input mt-1.5 font-normal"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                />
              </Field>
              <Field label="Reason" className="sm:col-span-2">
                <textarea
                  rows={2}
                  className="input mt-1.5 font-normal"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </div>

            {mode === "OUT" && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                The student will no longer appear in class lists or attendance.
                Their fee, attendance and result history is kept.
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <button className="btn-primary px-6" disabled={busy}>
                {busy && <Loader2 size={15} className="animate-spin" />}
                {mode === "INTERNAL" ? "Move student" : "Transfer out"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function HistoryTab() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const params = {
    q: dq || undefined,
    type: type || undefined,
    page,
    pageSize: 20,
  };

  const list = useQuery({
    queryKey: ["transfers", "history", params],
    queryFn: async () =>
      (
        await api.get<{
          data: {
            items: HistoryRow[];
            total: number;
            page: number;
            pageSize: number;
          };
        }>("/transfers/history", { params })
      ).data.data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search student name or admission no"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All transfers</option>
          <option value="INTERNAL">Moved inside school</option>
          <option value="OUT">Transferred out</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To / destination</th>
              <th className="px-4 py-3">Certificate</th>
              <th className="px-4 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
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
                  colSpan={8}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load history")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No transfers recorded yet.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.transferDate)}
                </td>
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.type === "OUT" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}
                  >
                    {r.type === "OUT" ? "Transferred out" : "Moved"}
                  </span>
                </td>
                <td className="px-4 py-3">{r.session}</td>
                <td className="whitespace-nowrap px-4 py-3">{place(r.from)}</td>
                <td className="px-4 py-3">
                  {r.type === "OUT"
                    ? (r.destinationSchool ?? "—")
                    : place(r.to)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.certificateNo ?? "—"}
                </td>
                <td className="px-4 py-3">{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}
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
    </>
  );
}

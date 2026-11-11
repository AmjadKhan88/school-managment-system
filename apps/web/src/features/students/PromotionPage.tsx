import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  Repeat,
  Search,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { ClassOption, fmtDate, useClasses, useDebounced } from "./shared";

type Outcome = "PROMOTED" | "REPEATED" | "GRADUATED";
const OUTCOME_LABEL: Record<Outcome, string> = {
  PROMOTED: "Promoted",
  REPEATED: "Repeated",
  GRADUATED: "Graduated",
};
const OUTCOME_STYLE: Record<Outcome, string> = {
  PROMOTED: "bg-emerald-100 text-emerald-700",
  REPEATED: "bg-amber-100 text-amber-700",
  GRADUATED: "bg-sky-100 text-sky-700",
};

interface SectionOption {
  id: string;
  name: string;
  classId: string;
  isActive: boolean;
}
interface Candidate {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  rollNo: number | null;
  class: { id: string; name: string; level: number };
  section: { id: string; name: string };
  alreadyInTarget: boolean;
}
interface Candidates {
  nextClassId: string | null;
  items: Candidate[];
}
interface RowState {
  selected: boolean;
  outcome: Outcome;
  classId: string;
  sectionId: string;
}
interface Problem {
  studentId: string;
  name: string;
  message: string;
}
interface HistoryRow {
  id: string;
  batchId: string;
  createdAt: string;
  outcome: Outcome;
  remarks: string | null;
  student: { id: string; admissionNo: string; fullName: string };
  from: {
    session: string;
    className: string;
    section: string;
    rollNo: number | null;
  } | null;
  to: {
    session: string;
    className: string;
    section: string;
    rollNo: number | null;
  } | null;
}

const serverProblems = (e: unknown): Problem[] =>
  (e as AxiosError<{ errors?: { errors?: Problem[] } }>)?.response?.data?.errors
    ?.errors ?? [];

function useSections() {
  return useQuery({
    queryKey: ["/academics/sections", "all"],
    queryFn: async () =>
      (await api.get<{ data: SectionOption[] }>("/academics/sections")).data
        .data,
  });
}

// ====================================================================
export default function PromotionPage() {
  const can = useAuth((s) => s.can);
  const [tab, setTab] = useState<"promote" | "history">("promote");

  if (!can("promotion", "VIEW")) {
    return (
      <div className="card p-8 text-sm text-slate-600">
        You do not have permission to view student promotion.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Student Promotion"
        subtitle="Move students into the next session. Past records are never changed: each student gets a new enrollment."
      />
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ["promote", "Promote students"],
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
      {tab === "promote" ? <PromoteTab /> : <HistoryTab />}
    </>
  );
}

// ====================================================================
function PromoteTab() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId } = useAuth();

  const [fromSessionId, setFrom] = useState(sessionId ?? "");
  const [toSessionId, setTo] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [problems, setProblems] = useState<Problem[]>([]);
  const [bulkSection, setBulkSection] = useState("");

  const classes = useClasses();
  const sections = useSections();
  const classById = new Map<string, ClassOption>(
    (classes.data ?? []).map((c) => [c.id, c]),
  );

  const ready =
    !!fromSessionId &&
    !!toSessionId &&
    !!classId &&
    fromSessionId !== toSessionId;
  const cands = useQuery({
    queryKey: [
      "promotion",
      "candidates",
      fromSessionId,
      toSessionId,
      classId,
      sectionFilter,
    ],
    enabled: ready,
    queryFn: async () =>
      (
        await api.get<{ data: Candidates }>("/promotion/candidates", {
          params: {
            fromSessionId,
            toSessionId,
            classId,
            sectionId: sectionFilter || undefined,
          },
        })
      ).data.data,
  });

  const nextClassId = cands.data?.nextClassId ?? null;
  const sectionsOf = (cid: string) =>
    (sections.data ?? []).filter((s) => s.classId === cid && s.isActive);

  // Same-named section in the next class is the natural default for promoted students.
  const defaultSectionFor = (c: Candidate) =>
    sectionsOf(nextClassId ?? "").find((s) => s.name === c.section.name)?.id ??
    "";

  // (Re)build row state whenever a new student list arrives.
  useEffect(() => {
    if (!cands.data) {
      setRows({});
      return;
    }
    const next: Record<string, RowState> = {};
    cands.data.items.forEach((c) => {
      next[c.studentId] = {
        selected: !c.alreadyInTarget,
        outcome: cands.data!.nextClassId ? "PROMOTED" : "GRADUATED",
        classId: cands.data!.nextClassId ?? "",
        sectionId: cands.data!.nextClassId ? defaultSectionFor(c) : "",
      };
    });
    setRows(next);
    setProblems([]);
  }, [cands.data, sections.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = cands.data?.items ?? [];
  const selectable = items.filter((c) => !c.alreadyInTarget);
  const selectedItems = selectable.filter((c) => rows[c.studentId]?.selected);

  const patch = (id: string, p: Partial<RowState>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const applyOutcome = (c: Candidate, outcome: Outcome) => {
    if (outcome === "REPEATED")
      patch(c.studentId, {
        outcome,
        classId: c.class.id,
        sectionId: c.section.id,
      });
    else if (outcome === "GRADUATED")
      patch(c.studentId, { outcome, classId: "", sectionId: "" });
    else
      patch(c.studentId, {
        outcome,
        classId: nextClassId ?? "",
        sectionId: defaultSectionFor(c),
      });
  };

  const setOutcomeForSelected = (outcome: Outcome) => {
    if (outcome === "PROMOTED" && !nextClassId) {
      toast.error(
        "There is no higher class to promote into. Choose Graduate or Repeat.",
      );
      return;
    }
    selectedItems.forEach((c) => applyOutcome(c, outcome));
  };

  const setSectionForSelected = (sectionId: string) => {
    setBulkSection(sectionId);
    if (!sectionId) return;
    selectedItems.forEach((c) => {
      if (rows[c.studentId]?.outcome === "PROMOTED")
        patch(c.studentId, { sectionId });
    });
  };

  const allSelected =
    selectable.length > 0 && selectedItems.length === selectable.length;
  const toggleAll = () =>
    selectable.forEach((c) => patch(c.studentId, { selected: !allSelected }));

  const counts = selectedItems.reduce(
    (a, c) => {
      a[rows[c.studentId].outcome]++;
      return a;
    },
    { PROMOTED: 0, REPEATED: 0, GRADUATED: 0 } as Record<Outcome, number>,
  );

  const execute = useMutation({
    mutationFn: () =>
      api.post<{
        data: { promoted: number; repeated: number; graduated: number };
      }>("/promotion/execute", {
        fromSessionId,
        toSessionId,
        items: selectedItems.map((c) => {
          const r = rows[c.studentId];
          return {
            studentId: c.studentId,
            outcome: r.outcome,
            classId: r.outcome === "PROMOTED" ? r.classId : undefined,
            sectionId: r.outcome === "GRADUATED" ? undefined : r.sectionId,
          };
        }),
      }),
    onSuccess: (res) => {
      const d = res.data.data;
      toast.success(
        `Done: ${d.promoted} promoted, ${d.repeated} repeated, ${d.graduated} graduated`,
      );
      setProblems([]);
      qc.invalidateQueries({ queryKey: ["promotion"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e) => {
      setProblems(serverProblems(e));
      toast.error(apiMessage(e, "Promotion failed. Nothing was saved."));
    },
  });

  const submit = () => {
    for (const c of selectedItems) {
      const r = rows[c.studentId];
      if (r.outcome === "PROMOTED" && !r.classId) {
        toast.error(`Choose a class for ${c.fullName}`);
        return;
      }
      if (r.outcome !== "GRADUATED" && !r.sectionId) {
        toast.error(`Choose a section for ${c.fullName}`);
        return;
      }
    }
    const toName = user?.sessions.find((s) => s.id === toSessionId)?.name;
    const msg =
      `Move ${selectedItems.length} student(s) into ${toName}?\n\n` +
      `Promote: ${counts.PROMOTED}\nRepeat: ${counts.REPEATED}\nGraduate: ${counts.GRADUATED}\n\n` +
      `Their old class records stay unchanged.`;
    if (window.confirm(msg)) execute.mutate();
  };

  const sessionOptions = user?.sessions ?? [];
  const bulkSections = nextClassId ? sectionsOf(nextClassId) : [];

  return (
    <>
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-semibold">
          From session
          <select
            className="input mt-1.5 font-normal"
            value={fromSessionId}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value="">Select…</option>
            {sessionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          To session
          <select
            className="input mt-1.5 font-normal"
            value={toSessionId}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">Select…</option>
            {sessionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Class
          <select
            className="input mt-1.5 font-normal"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionFilter("");
            }}
          >
            <option value="">Select…</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Section (optional)
          <select
            className="input mt-1.5 font-normal"
            value={sectionFilter}
            disabled={!classId}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="">All sections</option>
            {sectionsOf(classId).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {fromSessionId && toSessionId && fromSessionId === toSessionId && (
        <p className="mb-4 text-sm text-rose-600">
          Choose two different sessions. Create the next session under Academic
          Sessions first if it does not exist.
        </p>
      )}
      {!ready && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose the sessions and a class to load its students.
        </div>
      )}
      {ready && cands.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {ready && cands.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(cands.error, "Could not load students")}
        </div>
      )}

      {problems.length > 0 && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          role="alert"
        >
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={16} />
            Nothing was saved. Fix these and try again:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p.studentId}>
                <strong>{p.name}</strong>: {p.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ready &&
        cands.isSuccess &&
        (items.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            No students are waiting to be promoted from this class in the source
            session.
          </div>
        ) : (
          <>
            {can("promotion", "CREATE") && (
              <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
                <span className="text-sm font-semibold">
                  {selectedItems.length} selected. Mark as:
                </span>
                <button
                  className="btn border border-emerald-600 py-1.5 text-emerald-700"
                  onClick={() => setOutcomeForSelected("PROMOTED")}
                >
                  <TrendingUp size={15} />
                  Promote
                </button>
                <button
                  className="btn border border-amber-500 py-1.5 text-amber-700"
                  onClick={() => setOutcomeForSelected("REPEATED")}
                >
                  <Repeat size={15} />
                  Repeat
                </button>
                <button
                  className="btn border border-sky-500 py-1.5 text-sky-700"
                  onClick={() => setOutcomeForSelected("GRADUATED")}
                >
                  <GraduationCap size={15} />
                  Graduate
                </button>
                {bulkSections.length > 0 && (
                  <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
                    Section for promoted
                    <select
                      className="input w-32 py-1.5 font-normal"
                      value={bulkSection}
                      onChange={(e) => setSectionForSelected(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {bulkSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-4 py-3">Admission no</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Current</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">New class</th>
                    <th className="px-4 py-3">New section</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => {
                    const r = rows[c.studentId];
                    if (!r) return null;
                    const higher = (classes.data ?? []).filter(
                      (k) => k.level > c.class.level,
                    );
                    return (
                      <tr
                        key={c.studentId}
                        className={`border-b border-line last:border-0 ${c.alreadyInTarget ? "bg-slate-50 text-slate-400" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            disabled={c.alreadyInTarget}
                            checked={r.selected}
                            onChange={(e) =>
                              patch(c.studentId, { selected: e.target.checked })
                            }
                            aria-label={`Select ${c.fullName}`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">
                          {c.admissionNo}
                        </td>
                        <td className="px-4 py-3">
                          {c.fullName}
                          <span className="block text-xs text-slate-500">
                            {c.fatherName}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {c.class.name} / {c.section.name}
                          {c.rollNo ? ` / #${c.rollNo}` : ""}
                        </td>
                        {c.alreadyInTarget ? (
                          <td colSpan={3} className="px-4 py-3 text-xs">
                            Already enrolled in the target session
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              <select
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                                value={r.outcome}
                                onChange={(e) =>
                                  applyOutcome(c, e.target.value as Outcome)
                                }
                                aria-label="Outcome"
                              >
                                <option
                                  value="PROMOTED"
                                  disabled={!nextClassId}
                                >
                                  Promote
                                </option>
                                <option value="REPEATED">Repeat</option>
                                <option value="GRADUATED">Graduate</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              {r.outcome === "PROMOTED" ? (
                                <select
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                                  value={r.classId}
                                  onChange={(e) =>
                                    patch(c.studentId, {
                                      classId: e.target.value,
                                      sectionId: "",
                                    })
                                  }
                                  aria-label="New class"
                                >
                                  <option value="">Select…</option>
                                  {higher.map((k) => (
                                    <option key={k.id} value={k.id}>
                                      {k.name}
                                    </option>
                                  ))}
                                </select>
                              ) : r.outcome === "REPEATED" ? (
                                c.class.name
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {r.outcome === "GRADUATED" ? (
                                "—"
                              ) : (
                                <select
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                                  value={r.sectionId}
                                  onChange={(e) =>
                                    patch(c.studentId, {
                                      sectionId: e.target.value,
                                    })
                                  }
                                  aria-label="New section"
                                >
                                  <option value="">Select…</option>
                                  {sectionsOf(
                                    r.outcome === "REPEATED"
                                      ? c.class.id
                                      : r.classId,
                                  ).map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {can("promotion", "CREATE") && (
              <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                <p className="text-sm text-slate-600">
                  {counts.PROMOTED} promote · {counts.REPEATED} repeat ·{" "}
                  {counts.GRADUATED} graduate
                </p>
                <button
                  className="btn-primary px-6"
                  disabled={selectedItems.length === 0 || execute.isPending}
                  onClick={submit}
                >
                  {execute.isPending && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  Apply promotion
                </button>
              </div>
            )}
            {classById.size === 0 && null}
          </>
        ))}
    </>
  );
}

// ====================================================================
function HistoryTab() {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const params = {
    q: dq || undefined,
    outcome: outcome || undefined,
    page,
    pageSize: 20,
  };

  const list = useQuery({
    queryKey: ["promotion", "history", params],
    queryFn: async () =>
      (
        await api.get<{
          data: {
            items: HistoryRow[];
            total: number;
            page: number;
            pageSize: number;
          };
        }>("/promotion/history", { params })
      ).data.data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const place = (p: HistoryRow["from"]) =>
    p
      ? `${p.session} · ${p.className} / ${p.section}${p.rollNo ? ` / #${p.rollNo}` : ""}`
      : "—";

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
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All outcomes</option>
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((k) => (
            <option key={k} value={k}>
              {OUTCOME_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
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
                  colSpan={5}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load history")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No promotions recorded yet.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${OUTCOME_STYLE[r.outcome]}`}
                  >
                    {OUTCOME_LABEL[r.outcome]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{place(r.from)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.outcome === "GRADUATED" ? "Passed out" : place(r.to)}
                </td>
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

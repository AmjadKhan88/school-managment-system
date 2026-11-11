import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Field, useClasses, useDebounced } from "@/features/students/shared";
import { Frequency, FREQUENCY_LABEL, fmtMoney } from "./shared";

interface Row {
  enrollmentId: string;
  rollNo: number | null;
  student: { id: string; admissionNo: string; fullName: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
  assigned: boolean;
  hasStructure: boolean;
  structureMismatch: boolean;
  overrideCount: number;
  monthlyTotal: string;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface SectionOption {
  id: string;
  name: string;
  isActive: boolean;
}
interface DetailItem {
  categoryId: string;
  name: string;
  code: string;
  frequency: Frequency;
  defaultAmount: string;
  overrideAmount: string | null;
  overrideReason: string | null;
  amount: string;
}
interface Detail {
  enrollmentId: string;
  student: { fullName: string; admissionNo: string };
  class: { name: string };
  section: { name: string };
  assigned: boolean;
  structureId: string | null;
  items: DetailItem[];
}

const PAGE_SIZE = 20;

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { sessionId, user } = useAuth();
  const sessionName = user?.sessions.find((s) => s.id === sessionId)?.name;

  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [assigned, setAssigned] = useState("");
  const [page, setPage] = useState(1);
  const [dialogId, setDialogId] = useState<string | null>(null);
  const dq = useDebounced(q);

  const classes = useClasses();
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

  const params = {
    sessionId,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    assigned: assigned || undefined,
    q: dq || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: ["fees", "assignments", params],
    enabled: !!sessionId,
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/assignments", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["fees", "assignments"] });

  const assignOne = useMutation({
    mutationFn: (enrollmentId: string) =>
      api.put(`/fees/assignments/${enrollmentId}`, { overrides: [] }),
    onSuccess: () => {
      toast.success("Class fees assigned");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const bulk = useMutation({
    mutationFn: () =>
      api.post<{ data: { assigned: number } }>("/fees/assignments/bulk", {
        sessionId,
        classId,
        sectionId: sectionId || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Assigned fees to ${res.data.data.assigned} student(s)`);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const className = classes.data?.find((c) => c.id === classId)?.name;
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  if (!sessionId)
    return (
      <div className="card p-8 text-sm text-slate-600">
        Create and select an academic session first.
      </div>
    );

  return (
    <>
      <PageHeader
        title="Student Fee Assignment"
        subtitle={`Link each student to their class fees for session ${sessionName ?? ""}, and give individual students different prices where needed.`}
        actions={
          can("fees", "CREATE") &&
          classId && (
            <button
              className="btn-primary"
              disabled={bulk.isPending}
              onClick={() =>
                window.confirm(
                  `Assign the ${className} fee structure to every student in ${className}${sectionId ? " (selected section)" : ""} who has none yet?`,
                ) && bulk.mutate()
              }
            >
              {bulk.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Users size={16} />
              )}
              Assign to all unassigned
            </button>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search name or admission no"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSectionId("");
            setPage(1);
          }}
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
          value={sectionId}
          disabled={!classId}
          onChange={(e) => reset(setSectionId)(e.target.value)}
        >
          <option value="">
            {classId ? "All sections" : "Pick a class first"}
          </option>
          {sections.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={assigned}
          onChange={(e) => reset(setAssigned)(e.target.value)}
        >
          <option value="">Assigned and unassigned</option>
          <option value="true">Assigned only</option>
          <option value="false">Unassigned only</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Admission no</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Monthly fee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                  {apiMessage(list.error, "Could not load students")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No enrolled students match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.enrollmentId}
                className="border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.student.admissionNo}
                </td>
                <td className="px-4 py-3">{r.student.fullName}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.class.name} / {r.section.name}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.hasStructure || r.assigned
                    ? fmtMoney(r.monthlyTotal)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.structureMismatch ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      <AlertTriangle size={12} />
                      Class changed: reassign
                    </span>
                  ) : r.assigned ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Assigned
                      {r.overrideCount > 0
                        ? ` · ${r.overrideCount} custom`
                        : ""}
                    </span>
                  ) : !r.hasStructure ? (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                      No class structure
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      Not assigned
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {can("fees", "EDIT") && r.hasStructure && (
                    <div className="inline-flex gap-1">
                      {!r.assigned && (
                        <button
                          onClick={() => assignOne.mutate(r.enrollmentId)}
                          disabled={assignOne.isPending}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          Assign
                        </button>
                      )}
                      <button
                        onClick={() => setDialogId(r.enrollmentId)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        {r.structureMismatch ? "Reassign" : "Customize"}
                      </button>
                    </div>
                  )}
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

      {dialogId && (
        <CustomizeDialog
          enrollmentId={dialogId}
          onClose={() => setDialogId(null)}
          onSaved={() => {
            setDialogId(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function CustomizeDialog({
  enrollmentId,
  onClose,
  onSaved,
}: {
  enrollmentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detail = useQuery({
    queryKey: ["fees", "assignment", enrollmentId],
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/fees/assignments/${enrollmentId}`))
        .data.data,
  });
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setCustom(
      Object.fromEntries(
        d.items.map((i) => [
          i.categoryId,
          i.overrideAmount !== null ? String(Number(i.overrideAmount)) : "",
        ]),
      ),
    );
    setReason(d.items.find((i) => i.overrideReason)?.overrideReason ?? "");
  }, [detail.data]);

  const items = detail.data?.items ?? [];
  const effective = (i: DetailItem) =>
    custom[i.categoryId] !== undefined && custom[i.categoryId] !== ""
      ? Number(custom[i.categoryId])
      : Number(i.defaultAmount);
  const monthly = items
    .filter((i) => i.frequency === "MONTHLY")
    .reduce((s, i) => s + effective(i), 0);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/fees/assignments/${enrollmentId}`, {
        overrides: items
          .filter(
            (i) =>
              custom[i.categoryId] !== "" &&
              custom[i.categoryId] !== undefined &&
              Number(custom[i.categoryId]) !== Number(i.defaultAmount),
          )
          .map((i) => ({
            categoryId: i.categoryId,
            amount: Number(custom[i.categoryId]),
            reason: reason || undefined,
          })),
      }),
    onSuccess: () => {
      toast.success("Student fees saved");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      items.some(
        (i) =>
          custom[i.categoryId] &&
          (isNaN(Number(custom[i.categoryId])) ||
            Number(custom[i.categoryId]) < 0),
      )
    ) {
      toast.error("Custom amounts must be 0 or more");
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
      <form onSubmit={submit} className="card w-full max-w-xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {detail.data ? detail.data.student.fullName : "Student fees"}
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
        {detail.isLoading && (
          <Loader2 className="mx-auto my-8 animate-spin text-slate-400" />
        )}
        {detail.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(detail.error, "Could not load fees")}
          </p>
        )}
        {detail.data && (
          <>
            <p className="mt-1 text-xs text-slate-500">
              {detail.data.student.admissionNo} · {detail.data.class.name} /{" "}
              {detail.data.section.name}. Leave "Custom" empty to use the class
              price. Enter 0 to waive a fee.
            </p>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="py-2">Fee</th>
                  <th className="py-2">Class price</th>
                  <th className="py-2">Custom</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.categoryId} className="border-t border-line">
                    <td className="py-2 pr-2">
                      {i.name}
                      <span className="block text-xs text-slate-400">
                        {FREQUENCY_LABEL[i.frequency]}
                      </span>
                    </td>
                    <td className="py-2 pr-2">{fmtMoney(i.defaultAmount)}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input w-32 py-1.5"
                        placeholder="Same"
                        value={custom[i.categoryId] ?? ""}
                        onChange={(e) =>
                          setCustom({
                            ...custom,
                            [i.categoryId]: e.target.value,
                          })
                        }
                        aria-label={`Custom ${i.name}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm">
              Monthly total for this student:{" "}
              <strong>{fmtMoney(monthly)}</strong>
            </p>
            <Field label="Reason for custom prices" className="mt-4">
              <input
                className="input mt-1.5 font-normal"
                placeholder="e.g. Sibling concession, staff child"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
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
              <button
                className="btn-primary"
                disabled={save.isPending || items.length === 0}
              >
                {save.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Save
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

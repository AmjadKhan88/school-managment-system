import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Loader2, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { fmtMoney } from "./shared";

interface StudentRow {
  enrollmentId: string;
  rollNo: number | null;
  student: { admissionNo: string; fullName: string };
  section: { name: string };
}
interface SectionOption {
  id: string;
  name: string;
  isActive: boolean;
}
interface PreviewRow {
  enrollmentId: string;
  admissionNo: string;
  fullName: string;
  className: string;
  section: string;
  itemCount: number;
  subtotal: string;
  discountTotal: string;
  fineAmount: string;
  totalAmount: string;
  previousBalance: string;
}
interface Skipped {
  enrollmentId: string;
  admissionNo: string;
  fullName: string;
  reason: string;
}
interface Result {
  dryRun: boolean;
  created: number;
  wouldCreate: number;
  skipped: Skipped[];
  preview: PreviewRow[];
  totals: {
    subtotal: string;
    discountTotal: string;
    fineAmount: string;
    totalAmount: string;
  };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function GeneratePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();

  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [periodKey, setPeriodKey] = useState(thisMonth());
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [mode, setMode] = useState<"class" | "selected">("class");
  const [includeOneTime, setIncludeOneTime] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);

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
  const students = useQuery({
    queryKey: ["fees", "gen-students", sessionId, classId, sectionId],
    enabled: mode === "selected" && !!sessionId && !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: { items: StudentRow[] } }>("/fees/assignments", {
          params: {
            sessionId,
            classId,
            sectionId: sectionId || undefined,
            pageSize: 100,
          },
        })
      ).data.data.items,
  });

  // Any change to the inputs invalidates the previous preview.
  useEffect(() => {
    setResult(null);
  }, [sessionId, periodKey, classId, sectionId, mode, includeOneTime, picked]);
  useEffect(() => {
    setPicked(new Set());
  }, [classId, sectionId, sessionId]);

  const payload = (dryRun: boolean) => ({
    sessionId,
    periodKey,
    includeOneTime,
    dryRun,
    ...(mode === "class"
      ? { classId, sectionId: sectionId || undefined }
      : { classId, enrollmentIds: [...picked] }),
  });

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      api.post<{ data: Result }>("/fees/invoices/generate", payload(dryRun)),
    onSuccess: (res, dryRun) => {
      setResult(res.data.data);
      if (!dryRun) {
        toast.success(`Generated ${res.data.data.created} invoice(s)`);
        qc.invalidateQueries({ queryKey: ["fees"] });
      }
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const ready =
    !!sessionId &&
    !!periodKey &&
    !!classId &&
    (mode === "class" || picked.size > 0);
  const generated = result && !result.dryRun;
  const previewed = result?.dryRun && result.wouldCreate > 0;
  const allPicked =
    !!students.data?.length &&
    students.data.every((s) => picked.has(s.enrollmentId));

  if (!can("fees", "CREATE"))
    return (
      <div className="card p-8 text-sm text-slate-600">
        You do not have permission to generate fees.
      </div>
    );

  return (
    <>
      <PageHeader
        title="Monthly Fee Generation"
        subtitle="Create fee vouchers for a month. Preview first: nothing is saved until you press Generate."
      />

      <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Session">
          <select
            className="input mt-1.5 font-normal"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Select…</option>
            {user?.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fee month">
          <input
            type="month"
            className="input mt-1.5 font-normal"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
          />
        </Field>
        <Field label="Class">
          <select
            className="input mt-1.5 font-normal"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
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
        <Field label="Section (optional)">
          <select
            className="input mt-1.5 font-normal"
            disabled={!classId}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">All sections</option>
            {sections.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap items-center gap-6 sm:col-span-2 lg:col-span-4">
          {(
            [
              ["class", "Entire class"],
              ["selected", "Selected students"],
            ] as const
          ).map(([k, label]) => (
            <label
              key={k}
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <input
                type="radio"
                name="mode"
                className="h-4 w-4"
                checked={mode === k}
                onChange={() => setMode(k)}
              />
              {label}
            </label>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={includeOneTime}
              onChange={(e) => setIncludeOneTime(e.target.checked)}
            />
            Include one-time and yearly fees not yet billed
          </label>
        </div>
      </div>

      {mode === "selected" && classId && (
        <div className="card mt-4 max-h-72 overflow-y-auto p-4">
          {students.isLoading && (
            <Loader2 className="animate-spin text-slate-400" size={18} />
          )}
          {students.data?.length === 0 && (
            <p className="text-sm text-slate-500">
              No enrolled students in this selection.
            </p>
          )}
          {!!students.data?.length && (
            <>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allPicked}
                  onChange={() =>
                    setPicked(
                      allPicked
                        ? new Set()
                        : new Set(students.data!.map((s) => s.enrollmentId)),
                    )
                  }
                />
                Select all ({students.data.length})
              </label>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {students.data.map((s) => (
                  <label
                    key={s.enrollmentId}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={picked.has(s.enrollmentId)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          e.target.checked
                            ? n.add(s.enrollmentId)
                            : n.delete(s.enrollmentId);
                          return n;
                        })
                      }
                    />
                    <span>
                      {s.student.fullName}
                      <span className="ml-1 text-xs text-slate-400">
                        {s.student.admissionNo} · {s.section.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn border border-slate-300"
          disabled={!ready || run.isPending}
          onClick={() => run.mutate(true)}
        >
          {run.isPending && run.variables === true ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Eye size={16} />
          )}
          Preview
        </button>
        <button
          className="btn-primary"
          disabled={!previewed || run.isPending}
          onClick={() =>
            window.confirm(
              `Generate ${result!.wouldCreate} invoice(s) totalling ${fmtMoney(result!.totals.totalAmount)} for ${periodKey}?`,
            ) && run.mutate(false)
          }
        >
          {run.isPending && run.variables === false ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Receipt size={16} />
          )}
          Generate invoices
        </button>
      </div>

      {generated && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-bold">
            <CheckCircle2 size={16} />
            Created {result.created} invoice(s) for {periodKey}, totalling{" "}
            {fmtMoney(result.totals.totalAmount)}.
          </p>
          <Link
            to="/fees/vouchers"
            className="mt-1 inline-block font-semibold underline"
          >
            View fee vouchers
          </Link>
        </div>
      )}

      {result && result.dryRun && (
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ["Invoices to create", String(result.wouldCreate)],
            ["Fees", fmtMoney(result.totals.subtotal)],
            ["Discounts", fmtMoney(result.totals.discountTotal)],
            ["Total with fines", fmtMoney(result.totals.totalAmount)],
          ].map(([l, v]) => (
            <div key={l} className="card p-4">
              <p className="text-xs font-semibold text-slate-500">{l}</p>
              <p className="mt-1 text-xl font-extrabold text-ink-950">{v}</p>
            </div>
          ))}
        </div>
      )}

      {result && result.dryRun && result.preview.length > 0 && (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Fees</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Fine</th>
                <th className="px-4 py-3">Invoice total</th>
                <th className="px-4 py-3">Previous dues</th>
              </tr>
            </thead>
            <tbody>
              {result.preview.map((r) => (
                <tr
                  key={r.enrollmentId}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-3">
                    {r.fullName}
                    <span className="block text-xs text-slate-500">
                      {r.admissionNo}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.className} / {r.section}
                  </td>
                  <td className="px-4 py-3">
                    {fmtMoney(r.subtotal)}
                    <span className="block text-xs text-slate-400">
                      {r.itemCount} item(s)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {Number(r.discountTotal)
                      ? `-${fmtMoney(r.discountTotal)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {Number(r.fineAmount) ? fmtMoney(r.fineAmount) : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {fmtMoney(r.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    {Number(r.previousBalance)
                      ? fmtMoney(r.previousBalance)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.skipped.length > 0 && (
        <div className="card mt-4 p-4">
          <h3 className="text-sm font-bold text-ink-950">
            Skipped ({result.skipped.length})
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {result.skipped.map((s) => (
              <li key={s.enrollmentId}>
                <strong>{s.fullName}</strong> ({s.admissionNo}): {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result?.dryRun && result.wouldCreate === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Nothing to generate for this selection.
        </p>
      )}
    </>
  );
}

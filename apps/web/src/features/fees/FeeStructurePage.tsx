import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Field } from "@/features/students/shared";
import { Frequency, FREQUENCY_LABEL, fmtMoney } from "./shared";

interface Category {
  id: string;
  name: string;
  code: string;
  frequency: Frequency;
  isActive: boolean;
}
interface StructureDto {
  id: string;
  dueDay: number;
  fineType: "NONE" | "FIXED" | "PER_DAY";
  fineAmount: string;
  graceDays: number;
  items: {
    categoryId: string;
    amount: string;
    category: { name: string; code: string; frequency: Frequency };
  }[];
  monthlyTotal: string;
  otherTotal: string;
}
interface ClassRow {
  id: string;
  name: string;
  level: number;
  structure: StructureDto | null;
}
interface FormState {
  dueDay: string;
  fineType: string;
  fineAmount: string;
  graceDays: string;
  items: { categoryId: string; amount: string }[];
}

const emptyForm = (): FormState => ({
  dueDay: "10",
  fineType: "NONE",
  fineAmount: "",
  graceDays: "0",
  items: [{ categoryId: "", amount: "" }],
});
const toForm = (s: StructureDto | null): FormState =>
  s
    ? {
        dueDay: String(s.dueDay),
        fineType: s.fineType,
        fineAmount: Number(s.fineAmount) ? String(Number(s.fineAmount)) : "",
        graceDays: String(s.graceDays),
        items: s.items.map((i) => ({
          categoryId: i.categoryId,
          amount: String(Number(i.amount)),
        })),
      }
    : emptyForm();

export default function FeeStructurePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();

  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [classId, setClassId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [copyPct, setCopyPct] = useState("0");

  const categories = useQuery({
    queryKey: ["fees", "categories"],
    queryFn: async () =>
      (await api.get<{ data: Category[] }>("/fees/categories")).data.data,
  });
  const structures = useQuery({
    queryKey: ["fees", "structures", sessionId],
    enabled: !!sessionId,
    queryFn: async () =>
      (
        await api.get<{ data: ClassRow[] }>("/fees/structures", {
          params: { sessionId },
        })
      ).data.data,
  });

  const selected = structures.data?.find((c) => c.id === classId);
  useEffect(() => {
    setForm(toForm(selected?.structure ?? null));
  }, [classId, structures.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const setItem = (i: number, patch: Partial<FormState["items"][number]>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    }));

  const live = form.items.reduce(
    (a, it) => {
      const n = Number(it.amount) || 0;
      if (catById.get(it.categoryId)?.frequency === "MONTHLY") a.monthly += n;
      else a.other += n;
      return a;
    },
    { monthly: 0, other: 0 },
  );

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["fees", "structures"] });

  const save = useMutation({
    mutationFn: () =>
      api.put("/fees/structures", {
        sessionId,
        classId,
        dueDay: Number(form.dueDay),
        fineType: form.fineType,
        fineAmount: form.fineType === "NONE" ? 0 : Number(form.fineAmount),
        graceDays: Number(form.graceDays || 0),
        items: form.items.map((i) => ({
          categoryId: i.categoryId,
          amount: Number(i.amount),
        })),
      }),
    onSuccess: () => {
      toast.success("Fee structure saved");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/fees/structures/${selected!.structure!.id}`),
    onSuccess: () => {
      toast.success("Fee structure deleted");
      refresh();
    },
    onError: (e) =>
      toast.error(
        apiMessage(e, "Cannot delete: students are assigned to this structure"),
      ),
  });

  const copy = useMutation({
    mutationFn: () =>
      api.post<{ data: { copied: number; skipped: number } }>(
        "/fees/structures/copy",
        {
          fromSessionId: copyFrom,
          toSessionId: sessionId,
          increasePercent: Number(copyPct || 0),
        },
      ),
    onSuccess: (res) => {
      toast.success(
        `Copied ${res.data.data.copied} class structure(s)${res.data.data.skipped ? `, skipped ${res.data.data.skipped} that already existed` : ""}`,
      );
      setCopyOpen(false);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      form.items.some(
        (i) => !i.categoryId || i.amount === "" || Number(i.amount) < 0,
      )
    ) {
      toast.error("Choose a category and enter an amount for every row");
      return;
    }
    const day = Number(form.dueDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      toast.error("Due day must be between 1 and 28");
      return;
    }
    if (form.fineType !== "NONE" && !(Number(form.fineAmount) > 0)) {
      toast.error("Enter the fine amount");
      return;
    }
    save.mutate();
  };

  const canEdit = can("fees", "EDIT");
  const usedIds = new Set(form.items.map((i) => i.categoryId));

  return (
    <>
      <PageHeader
        title="Fee Structure"
        subtitle="Set the fees for each class, per session. Invoices copy these prices when they are generated, so later changes never alter past invoices."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-40 font-semibold"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setClassId("");
              }}
              aria-label="Session"
            >
              <option value="">Select session…</option>
              {user?.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {can("fees", "CREATE") && sessionId && (
              <button
                className="btn border border-slate-300"
                onClick={() => {
                  setCopyFrom("");
                  setCopyPct("0");
                  setCopyOpen(true);
                }}
              >
                <Copy size={15} />
                Copy from session
              </button>
            )}
          </div>
        }
      />

      {!sessionId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose an academic session.
        </div>
      )}
      {sessionId && structures.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {sessionId && structures.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(structures.error, "Could not load fee structures")}
        </div>
      )}

      {sessionId && structures.data && (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="card h-fit overflow-hidden">
            {structures.data.length === 0 && (
              <p className="p-5 text-sm text-slate-500">
                No classes yet. Add classes under Academic Management.
              </p>
            )}
            <ul>
              {structures.data.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setClassId(c.id)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${classId === c.id ? "bg-brand-50" : ""}`}
                  >
                    <span className="font-semibold">{c.name}</span>
                    {c.structure ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={14} />
                        {fmtMoney(c.structure.monthlyTotal)}/mo
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not set</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {!selected ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              Select a class to set or edit its fees.
            </div>
          ) : (
            <form onSubmit={submit} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-ink-950">
                  {selected.name}
                </h2>
                {selected.structure && can("fees", "DELETE") && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-600 hover:underline"
                    onClick={() =>
                      window.confirm(
                        `Delete the fee structure for ${selected.name}?`,
                      ) && remove.mutate()
                    }
                  >
                    Delete structure
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {form.items.map((it, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_140px_auto] items-center gap-2"
                  >
                    <select
                      className="input"
                      value={it.categoryId}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setItem(i, { categoryId: e.target.value })
                      }
                      aria-label="Fee category"
                    >
                      <option value="">Select fee…</option>
                      {categories.data
                        ?.filter(
                          (c) =>
                            c.isActive &&
                            (!usedIds.has(c.id) || c.id === it.categoryId),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({FREQUENCY_LABEL[c.frequency]})
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input"
                      placeholder="Amount"
                      value={it.amount}
                      disabled={!canEdit}
                      onChange={(e) => setItem(i, { amount: e.target.value })}
                      aria-label="Amount"
                    />
                    {canEdit && form.items.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            items: f.items.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                        aria-label="Remove fee"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span className="w-9" />
                    )}
                  </div>
                ))}
              </div>
              {canEdit && form.items.length < 20 && (
                <button
                  type="button"
                  className="btn mt-3 border border-slate-300 py-1.5"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      items: [...f.items, { categoryId: "", amount: "" }],
                    }))
                  }
                >
                  <Plus size={15} />
                  Add fee
                </button>
              )}

              <div className="mt-4 flex flex-wrap gap-6 rounded-xl bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    Charged every month
                  </p>
                  <p className="text-lg font-extrabold text-ink-950">
                    {fmtMoney(live.monthly)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    One-time and yearly
                  </p>
                  <p className="text-lg font-extrabold text-ink-950">
                    {fmtMoney(live.other)}
                  </p>
                </div>
              </div>

              <h3 className="mt-6 text-sm font-bold text-ink-950">
                Due date and late fine
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Due day of month (1-28)">
                  <input
                    type="number"
                    min="1"
                    max="28"
                    className="input mt-1.5 font-normal"
                    value={form.dueDay}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setForm({ ...form, dueDay: e.target.value })
                    }
                  />
                </Field>
                <Field label="Late fine">
                  <select
                    className="input mt-1.5 font-normal"
                    value={form.fineType}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setForm({ ...form, fineType: e.target.value })
                    }
                  >
                    <option value="NONE">No fine</option>
                    <option value="FIXED">Fixed amount</option>
                    <option value="PER_DAY">Per day late</option>
                  </select>
                </Field>
                <Field label="Fine amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input mt-1.5 font-normal"
                    value={form.fineAmount}
                    disabled={!canEdit || form.fineType === "NONE"}
                    onChange={(e) =>
                      setForm({ ...form, fineAmount: e.target.value })
                    }
                  />
                </Field>
                <Field label="Grace days">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="input mt-1.5 font-normal"
                    value={form.graceDays}
                    disabled={!canEdit || form.fineType === "NONE"}
                    onChange={(e) =>
                      setForm({ ...form, graceDays: e.target.value })
                    }
                  />
                </Field>
              </div>

              {canEdit && (
                <div className="mt-6 flex justify-end">
                  <button
                    className="btn-primary px-6"
                    disabled={save.isPending}
                  >
                    {save.isPending && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                    Save fee structure
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {copyOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              copy.mutate();
            }}
            className="card w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Copy fee structures</h2>
              <button
                type="button"
                onClick={() => setCopyOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Copies into the selected session. Classes that already have a
              structure are left alone.
            </p>
            <div className="mt-4 space-y-4">
              <Field label="Copy from session *">
                <select
                  required
                  className="input mt-1.5 font-normal"
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                >
                  <option value="">Select…</option>
                  {user?.sessions
                    .filter((s) => s.id !== sessionId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Increase all amounts by (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  className="input mt-1.5 font-normal"
                  value={copyPct}
                  onChange={(e) => setCopyPct(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={() => setCopyOpen(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={copy.isPending}>
                {copy.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Copy
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

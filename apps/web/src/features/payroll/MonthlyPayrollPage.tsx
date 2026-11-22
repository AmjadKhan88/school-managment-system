import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { thisMonth } from "@/features/finance/shared";
import { Field, fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { METHOD_LABEL, money, monthName, RunsData } from "./shared";

interface Detail {
  id: string;
  slipNo: string;
  period: string;
  status: "DRAFT" | "APPROVED";
  employee: { fullName: string; employeeNo: string; designation: string };
  earnings: { label: string; amount: string }[];
  deductions: { label: string; amount: string }[];
  net: string;
  paid: string;
  balance: string;
  edit: {
    bonus: string;
    bonusNote: string | null;
    overtimeHours: string;
    overtimeRate: string;
    absenceDays: string;
    absenceOverridden: boolean;
    absenceNote: string | null;
  };
  attendance: {
    present: number;
    halfDays: number;
    absent: number;
    paidLeave: number;
    unpaidLeave: number;
    uncovered: number;
    outside: number;
    recorded: number;
    computedAbsenceDays: string;
  };
  payments: {
    id: string;
    receiptNo: string;
    paidOn: string;
    amount: string;
    method: string;
    reversedAt: string | null;
  }[];
}

export default function MonthlyPayrollPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [period, setPeriod] = useState(thisMonth());
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<
    { employee: string; reason: string }[]
  >([]);

  const runs = useQuery({
    queryKey: ["payroll", "runs", period],
    enabled: !!period,
    queryFn: async () =>
      (
        await api.get<{ data: RunsData }>("/payroll/runs", {
          params: { period },
        })
      ).data.data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["payroll"] });

  const generate = useMutation({
    mutationFn: () =>
      api.post<{
        data: {
          created: number;
          alreadyGenerated: number;
          skipped: { employee: string; reason: string }[];
        };
      }>("/payroll/runs/generate", { period }),
    onSuccess: (res) => {
      const r = res.data.data;
      setSkipped(r.skipped);
      toast.success(
        r.created
          ? `Payroll generated for ${r.created} employee(s)`
          : "Nothing new to generate",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const approve = useMutation({
    mutationFn: () =>
      api.post<{ data: { approved: number } }>("/payroll/runs/approve", {
        period,
      }),
    onSuccess: (res) => {
      toast.success(`${res.data.data.approved} payroll(s) approved`);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const d = runs.data;
  const items = (d?.items ?? []).filter(
    (r) =>
      (!status || r.status === status) &&
      (!q ||
        `${r.employee.fullName} ${r.employee.employeeNo}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );

  return (
    <>
      <PageHeader
        title="Monthly Payroll"
        subtitle="Generate a month's payroll from salary structures, attendance and loans. Review drafts, then approve. Approved payroll is locked."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              className="input w-44 font-semibold"
              max={thisMonth()}
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setSkipped([]);
              }}
              aria-label="Month"
            />
            {can("payroll", "CREATE") && (
              <button
                className="btn border border-slate-300"
                onClick={() => generate.mutate()}
                disabled={generate.isPending || !period}
              >
                {generate.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Generate payroll
              </button>
            )}
            {can("payroll", "APPROVE") && d && d.summary.drafts > 0 && (
              <button
                className="btn-primary"
                onClick={() =>
                  window.confirm(
                    `Approve ${d.summary.drafts} draft payroll(s) for ${monthName(period)}? They will be locked and loan instalments recorded.`,
                  ) && approve.mutate()
                }
                disabled={approve.isPending}
              >
                <CheckCircle2 size={16} />
                Approve all drafts ({d.summary.drafts})
              </button>
            )}
          </div>
        }
      />

      {skipped.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={16} />
            These employees were skipped:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {skipped.map((s) => (
              <li key={s.employee}>
                {s.employee}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Employees", d.summary.employees],
            ["Drafts", d.summary.drafts],
            ["Total net", money(d.summary.net)],
            ["Paid", money(d.summary.paid)],
            ["Still to pay", money(d.summary.balance)],
          ].map(([l, v]) => (
            <div key={String(l)} className="card p-3">
              <p className="text-xs font-semibold text-slate-500">{l}</p>
              <p className="mt-0.5 text-lg font-extrabold text-ink-950">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Employee name or number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Approved</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              {[
                "Basic",
                "Allowances",
                "Bonus + OT",
                "Deductions",
                "Net salary",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-right">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {runs.isError && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(runs.error, "Could not load payroll")}
                </td>
              </tr>
            )}
            {d && items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {d.summary.employees === 0
                    ? `No payroll for ${monthName(period)} yet. Press Generate payroll.`
                    : "No payroll matches the filters."}
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="px-4 py-3">
                  {r.employee.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.employee.employeeNo} · {r.employee.designation}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{money(r.basic)}</td>
                <td className="px-4 py-3 text-right">{money(r.allowances)}</td>
                <td className="px-4 py-3 text-right">
                  {money(Number(r.bonus) + Number(r.overtime))}
                </td>
                <td className="px-4 py-3 text-right">
                  {money(
                    Number(r.deductions) +
                      Number(r.loanRecovery) +
                      Number(r.absenceDeduction),
                  )}
                  {Number(r.absenceDeduction) > 0 && (
                    <span className="block text-xs text-rose-600">
                      absence {r.absenceDays} d
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold">
                  {money(r.net)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      r.status === "DRAFT"
                        ? "bg-amber-100 text-amber-700"
                        : Number(r.balance) > 0
                          ? "bg-sky-100 text-sky-700"
                          : "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {r.status === "DRAFT"
                      ? "Draft"
                      : Number(r.balance) > 0
                        ? Number(r.paid) > 0
                          ? "Part paid"
                          : "Approved"
                        : "Paid"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && (
        <PayrollDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function PayrollDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const q = useQuery({
    queryKey: ["payroll", "one", id],
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/payroll/runs/${id}`)).data.data,
  });
  const d = q.data;
  const [f, setF] = useState<{
    bonus: string;
    bonusNote: string;
    overtimeHours: string;
    overtimeRate: string;
    absenceDays: string;
    absenceNote: string;
  } | null>(null);
  const form =
    f ??
    (d
      ? {
          bonus: d.edit.bonus,
          bonusNote: d.edit.bonusNote ?? "",
          overtimeHours: d.edit.overtimeHours,
          overtimeRate: d.edit.overtimeRate,
          absenceDays: d.edit.absenceOverridden ? d.edit.absenceDays : "",
          absenceNote: d.edit.absenceNote ?? "",
        }
      : null);
  const set =
    (k: keyof NonNullable<typeof form>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setF({ ...form!, [k]: e.target.value });

  const done = (msg: string) => {
    toast.success(msg);
    setF(null);
    onChanged();
    qc.invalidateQueries({ queryKey: ["payroll", "one", id] });
  };
  const save = useMutation({
    mutationFn: () =>
      api.put<{ data: { negative: boolean } }>(`/payroll/runs/${id}`, {
        bonus: form!.bonus || 0,
        bonusNote: form!.bonusNote || undefined,
        overtimeHours: form!.overtimeHours || 0,
        overtimeRate: form!.overtimeRate || undefined,
        absenceDays:
          form!.absenceDays === "" ? undefined : Number(form!.absenceDays),
        absenceNote: form!.absenceNote || undefined,
      }),
    onSuccess: (r) =>
      done(
        r.data.data.negative
          ? "Saved, but the net salary is negative"
          : "Draft updated",
      ),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const recalc = useMutation({
    mutationFn: () => api.post(`/payroll/runs/${id}/recalculate`),
    onSuccess: () => done("Recalculated from the latest attendance and salary"),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const discard = useMutation({
    mutationFn: () => api.delete(`/payroll/runs/${id}`),
    onSuccess: () => {
      toast.success("Draft discarded");
      onChanged();
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const reopen = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/payroll/runs/${id}/reopen`, { reason }),
    onSuccess: () => done("Payroll reopened as a draft"),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const askReopen = () => {
    const reason = window.prompt(
      "Why is this approved payroll being reopened? This is recorded.",
    );
    if (reason && reason.trim().length >= 3) reopen.mutate(reason.trim());
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };

  const a = d?.attendance;
  const draft = d?.status === "DRAFT";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{d?.slipNo ?? "Payroll"}</h2>
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
        {d && a && form && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              <strong>{d.employee.fullName}</strong> · {d.employee.employeeNo} ·{" "}
              {d.employee.designation} · {monthName(d.period)}
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Earnings
                </h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {d.earnings.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{l.label}</span>
                      <span>{money(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-rose-700">
                  Deductions
                </h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {d.deductions.length === 0 && (
                    <li className="text-slate-400">None</li>
                  )}
                  {d.deductions.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{l.label}</span>
                      <span>{money(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-base font-extrabold">
              <span>Net salary</span>
              <span
                className={
                  Number(d.net) < 0 ? "text-rose-600" : "text-emerald-700"
                }
              >
                {money(d.net)}
              </span>
            </p>
            {!draft && (
              <p className="mt-1 text-right text-xs text-slate-500">
                Paid {money(d.paid)} · Balance {money(d.balance)}
              </p>
            )}

            <h3 className="mt-5 text-sm font-bold text-ink-950">
              Attendance used
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Present {a.present} · Half days {a.halfDays} · Absent {a.absent} ·
              Paid leave {a.paidLeave} · Unpaid leave {a.unpaidLeave} · Leave
              without approval {a.uncovered} · Outside employment {a.outside}.
              Days with attendance saved: <strong>{a.recorded}</strong>.
              Calculated absence:{" "}
              <strong>{a.computedAbsenceDays} day(s)</strong>.
            </p>
            {a.recorded === 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                No attendance has been saved for this employee this month, so
                nothing was deducted for absence. Take the register and
                recalculate if that is wrong.
              </p>
            )}

            {draft && can("payroll", "EDIT") && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="mt-5 rounded-xl border border-line p-4"
              >
                <h3 className="text-sm font-bold text-ink-950">Adjustments</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Bonus">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input mt-1.5 font-normal"
                      value={form.bonus}
                      onChange={set("bonus")}
                    />
                  </Field>
                  <Field label="Bonus note">
                    <input
                      className="input mt-1.5 font-normal"
                      value={form.bonusNote}
                      onChange={set("bonusNote")}
                    />
                  </Field>
                  <Field label="Overtime hours">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="input mt-1.5 font-normal"
                      value={form.overtimeHours}
                      onChange={set("overtimeHours")}
                    />
                  </Field>
                  <Field label="Rate per hour">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input mt-1.5 font-normal"
                      value={form.overtimeRate}
                      onChange={set("overtimeRate")}
                    />
                  </Field>
                  <Field label="Absence days (leave empty for automatic)">
                    <input
                      type="number"
                      min="0"
                      max="31"
                      step="0.5"
                      className="input mt-1.5 font-normal"
                      placeholder={a.computedAbsenceDays}
                      value={form.absenceDays}
                      onChange={set("absenceDays")}
                    />
                  </Field>
                  <Field
                    label={
                      form.absenceDays !== ""
                        ? "Reason for changing *"
                        : "Reason"
                    }
                  >
                    <input
                      className="input mt-1.5 font-normal"
                      required={form.absenceDays !== ""}
                      value={form.absenceNote}
                      onChange={set("absenceNote")}
                    />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="btn border border-slate-300"
                    onClick={() => recalc.mutate()}
                    disabled={recalc.isPending}
                  >
                    <RefreshCw size={15} />
                    Recalculate
                  </button>
                  <button
                    type="button"
                    className="btn border border-rose-300 text-rose-600"
                    onClick={() =>
                      window.confirm(
                        "Discard this draft? You can generate it again.",
                      ) && discard.mutate()
                    }
                    disabled={discard.isPending}
                  >
                    <Trash2 size={15} />
                    Discard
                  </button>
                  <button className="btn-primary" disabled={save.isPending}>
                    {save.isPending && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                    Save adjustments
                  </button>
                </div>
              </form>
            )}

            {!draft && (
              <div className="mt-5">
                <h3 className="text-sm font-bold text-ink-950">Payments</h3>
                {d.payments.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">
                    No payment yet. Record it under Salary Payments.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {d.payments.map((p) => (
                      <li
                        key={p.id}
                        className={cn(
                          "flex justify-between",
                          p.reversedAt && "text-slate-400 line-through",
                        )}
                      >
                        <span>
                          {p.receiptNo} · {fmtDate(p.paidOn)} ·{" "}
                          {METHOD_LABEL[p.method]}
                        </span>
                        <span>{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {can("payroll", "APPROVE") && (
                  <div className="mt-4 flex justify-end">
                    <button
                      className="btn border border-amber-500 text-amber-700"
                      onClick={askReopen}
                      disabled={reopen.isPending}
                    >
                      Reopen as draft
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

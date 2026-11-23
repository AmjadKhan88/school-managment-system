import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday, thisMonth } from "@/features/finance/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { METHOD_LABEL, money, monthName, PAY_METHODS } from "./shared";

type LStatus = "PENDING" | "ACTIVE" | "SETTLED" | "REJECTED" | "CANCELLED";
const STATUS: Record<LStatus, [string, string]> = {
  PENDING: ["Pending", "bg-amber-100 text-amber-700"],
  ACTIVE: ["Active", "bg-sky-100 text-sky-700"],
  SETTLED: ["Settled", "bg-emerald-100 text-emerald-700"],
  REJECTED: ["Rejected", "bg-rose-100 text-rose-700"],
  CANCELLED: ["Cancelled", "bg-slate-200 text-slate-500"],
};
interface Loan {
  id: string;
  loanNo: string;
  type: "ADVANCE" | "LOAN";
  status: LStatus;
  amount: string;
  instalments: number;
  instalmentAmount: string;
  startPeriod: string;
  reason: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  issuedOn: string | null;
  issueMethod: string | null;
  issueReference: string | null;
  recovered: string;
  balance: string;
  employee: {
    id: string;
    employeeNo: string;
    fullName: string;
    designation: string;
  };
  recoveriesList: {
    id: string;
    period: string;
    amount: string;
    slipNo: string;
    voidedAt: string | null;
  }[];
}
interface Paged {
  items: Loan[];
  total: number;
  page: number;
  pageSize: number;
  pending: number;
}
interface Found {
  id: string;
  employeeNo: string;
  fullName: string;
  designation: string;
  hasSalary: boolean;
}

export default function LoansPage({ type }: { type: "ADVANCE" | "LOAN" }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const noun = type === "ADVANCE" ? "Advance" : "Loan";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q);

  const params = {
    type,
    q: dq || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["loans", "list", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/staff-loans", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["loans"] });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title={type === "ADVANCE" ? "Advance Salary" : "Loan and Deductions"}
        subtitle={
          type === "ADVANCE"
            ? "Salary paid early and recovered from the next payroll(s)."
            : "Staff loans repaid in monthly instalments taken from payroll. Other deductions are set under Salary Structure."
        }
        actions={
          can("payroll", "CREATE") && (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              New {noun.toLowerCase()}
            </button>
          )
        }
      />

      {d && d.pending > 0 && can("payroll", "APPROVE") && (
        <button
          onClick={() => {
            setStatus("PENDING");
            setPage(1);
          }}
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          {d.pending} request{d.pending === 1 ? "" : "s"} waiting for a decision
        </button>
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
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS) as LStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS[k][0]}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">{noun}</th>
              <th className="px-4 py-3">Employee</th>
              {["Amount", "Instalment", "Recovered", "Balance"].map((h) => (
                <th key={h} className="px-4 py-3 text-right">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Status</th>
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
                  {apiMessage(list.error, "Could not load")}
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  Nothing here yet.
                </td>
              </tr>
            )}
            {d?.items.map((l) => (
              <tr
                key={l.id}
                onClick={() => setOpenId(l.id)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {l.loanNo}
                </td>
                <td className="px-4 py-3">
                  {l.employee.fullName}
                  <span className="block text-xs text-slate-500">
                    {l.employee.employeeNo}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{money(l.amount)}</td>
                <td className="px-4 py-3 text-right">
                  {money(l.instalmentAmount)}
                  <span className="block text-xs text-slate-500">
                    × {l.instalments}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{money(l.recovered)}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {money(l.balance)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {monthName(l.startPeriod)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      STATUS[l.status][1],
                    )}
                  >
                    {STATUS[l.status][0]}
                  </span>
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
        <NewLoan
          type={type}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {openId && (
        <LoanDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function NewLoan({
  type,
  onClose,
  onSaved,
}: {
  type: "ADVANCE" | "LOAN";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const ds = useDebounced(search.trim());
  const [emp, setEmp] = useState<Found | null>(null);
  const [f, setF] = useState({
    amount: "",
    instalments: type === "ADVANCE" ? "1" : "6",
    startPeriod: thisMonth(),
    reason: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const found = useQuery({
    queryKey: ["loans", "employee-search", ds],
    enabled: ds.length >= 2 && !emp,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/staff-loans/employee-search", {
          params: { q: ds },
        })
      ).data.data,
  });
  const perMonth =
    Number(f.amount) > 0 && Number(f.instalments) > 0
      ? Math.ceil((Number(f.amount) / Number(f.instalments)) * 100) / 100
      : 0;
  const save = useMutation({
    mutationFn: () =>
      api.post<{ data: { loanNo: string } }>("/staff-loans", {
        employeeId: emp!.id,
        type,
        amount: Number(f.amount),
        instalments: Number(f.instalments),
        startPeriod: f.startPeriod,
        reason: f.reason || undefined,
      }),
    onSuccess: (r) => {
      toast.success(`Request ${r.data.data.loanNo} recorded`);
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!emp) {
            toast.error("Choose an employee");
            return;
          }
          save.mutate();
        }}
        className="card w-full max-w-lg p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            New {type === "ADVANCE" ? "advance" : "loan"}
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
        <div className="mt-4">
          {emp ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <span>
                <strong>{emp.fullName}</strong> · {emp.employeeNo} ·{" "}
                {emp.designation}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => setEmp(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Field label="Find employee *">
                <input
                  className="input mt-1.5 font-normal"
                  autoFocus
                  placeholder="Name or employee number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <ul className="mt-2 space-y-1">
                {found.data?.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!s.hasSalary}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                      onClick={() => setEmp(s)}
                    >
                      <span className="font-semibold">{s.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {s.employeeNo} · {s.designation}
                        {!s.hasSalary ? " · no basic salary set" : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {found.data?.length === 0 && (
                  <li className="px-1 text-sm text-slate-500">
                    No active employee found.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Amount *">
            <input
              required
              type="number"
              min="1"
              step="0.01"
              className="input mt-1.5 font-normal"
              value={f.amount}
              onChange={set("amount")}
            />
          </Field>
          <Field label="Number of instalments *">
            <input
              required
              type="number"
              min="1"
              max={type === "ADVANCE" ? 12 : 60}
              className="input mt-1.5 font-normal"
              value={f.instalments}
              onChange={set("instalments")}
            />
          </Field>
          <Field label="First recovered in *">
            <input
              required
              type="month"
              className="input mt-1.5 font-normal"
              value={f.startPeriod}
              onChange={set("startPeriod")}
            />
          </Field>
          <div className="self-end pb-2 text-sm text-slate-600">
            {perMonth > 0 ? `About ${money(perMonth)} per month` : ""}
          </div>
          <Field label="Reason" className="sm:col-span-2">
            <input
              className="input mt-1.5 font-normal"
              value={f.reason}
              onChange={set("reason")}
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending || !emp}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Submit request
          </button>
        </div>
      </form>
    </div>
  );
}

function LoanDetail({
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
  const [issue, setIssue] = useState<{
    issuedOn: string;
    method: string;
    reference: string;
  } | null>(null);
  const q = useQuery({
    queryKey: ["loans", "one", id],
    queryFn: async () =>
      (await api.get<{ data: Loan }>(`/staff-loans/${id}`)).data.data,
  });
  const l = q.data;
  const done = (msg: string) => {
    toast.success(msg);
    setIssue(null);
    onChanged();
    qc.invalidateQueries({ queryKey: ["loans", "one", id] });
  };

  const approve = useMutation({
    mutationFn: () =>
      api.post(`/staff-loans/${id}/approve`, {
        issuedOn: issue!.issuedOn,
        method: issue!.method,
        reference: issue!.reference || undefined,
      }),
    onSuccess: () => done("Approved. Instalments will be taken from payroll."),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const withReason = useMutation({
    mutationFn: (v: { action: "reject" | "cancel"; reason: string }) =>
      api.post(`/staff-loans/${id}/${v.action}`, { reason: v.reason }),
    onSuccess: (_r, v) =>
      done(v.action === "reject" ? "Request rejected" : "Cancelled"),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const ask = (action: "reject" | "cancel", prompt: string) => {
    const reason = window.prompt(prompt);
    if (reason && reason.trim().length >= 3)
      withReason.mutate({ action, reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{l?.loanNo ?? "Loan"}</h2>
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
        {l && (
          <>
            <div className="mt-3 flex items-center justify-between">
              <p className="font-bold">
                {l.employee.fullName}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {l.employee.employeeNo}
                </span>
              </p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  STATUS[l.status][1],
                )}
              >
                {STATUS[l.status][0]}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold text-slate-500">Amount</dt>
                <dd>{money(l.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">
                  Instalments
                </dt>
                <dd>
                  {l.instalments} × {money(l.instalmentAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">
                  Recovery starts
                </dt>
                <dd>{monthName(l.startPeriod)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">
                  Balance
                </dt>
                <dd className="font-bold">{money(l.balance)}</dd>
              </div>
              {l.issuedOn && (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold text-slate-500">
                    Paid out
                  </dt>
                  <dd>
                    {fmtDate(l.issuedOn)}
                    {l.issueMethod ? ` · ${METHOD_LABEL[l.issueMethod]}` : ""}
                    {l.issueReference ? ` · ${l.issueReference}` : ""}
                  </dd>
                </div>
              )}
              {l.reason && (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold text-slate-500">
                    Reason
                  </dt>
                  <dd>{l.reason}</dd>
                </div>
              )}
              {l.rejectionReason && (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold text-rose-600">
                    Rejected because
                  </dt>
                  <dd>{l.rejectionReason}</dd>
                </div>
              )}
              {l.cancelReason && (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold text-slate-500">
                    Cancelled because
                  </dt>
                  <dd>{l.cancelReason}</dd>
                </div>
              )}
            </dl>

            <h3 className="mt-5 text-sm font-bold text-ink-950">Recoveries</h3>
            {l.recoveriesList.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Nothing recovered yet. Instalments are taken when a payroll is
                approved.
              </p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {l.recoveriesList.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "flex justify-between",
                      r.voidedAt && "text-slate-400 line-through",
                    )}
                  >
                    <span>
                      {monthName(r.period)} · {r.slipNo}
                      {r.voidedAt ? " (voided)" : ""}
                    </span>
                    <span>{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}

            {issue && (
              <div className="mt-5 rounded-xl border border-line p-4">
                <h3 className="text-sm font-bold text-ink-950">
                  Record the payout
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Paid on">
                    <input
                      type="date"
                      max={localToday()}
                      className="input mt-1.5 font-normal"
                      value={issue.issuedOn}
                      onChange={(e) =>
                        setIssue({ ...issue, issuedOn: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Method">
                    <select
                      className="input mt-1.5 font-normal"
                      value={issue.method}
                      onChange={(e) =>
                        setIssue({ ...issue, method: e.target.value })
                      }
                    >
                      {PAY_METHODS.map(([v, lab]) => (
                        <option key={v} value={v}>
                          {lab}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reference">
                    <input
                      className="input mt-1.5 font-normal"
                      value={issue.reference}
                      onChange={(e) =>
                        setIssue({ ...issue, reference: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  The payout is recorded in the Cash Book as an expense (Staff
                  advances and loans). Later instalments reduce salary, so they
                  are not booked again.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    className="btn border border-slate-300"
                    onClick={() => setIssue(null)}
                  >
                    Back
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => approve.mutate()}
                    disabled={approve.isPending || !issue.issuedOn}
                  >
                    {approve.isPending && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                    <Check size={15} />
                    Approve
                  </button>
                </div>
              </div>
            )}

            {!issue && (
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                {l.status === "PENDING" && can("payroll", "APPROVE") && (
                  <>
                    <button
                      className="btn border border-rose-300 text-rose-600"
                      onClick={() =>
                        ask("reject", "Why is this request being rejected?")
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() =>
                        setIssue({
                          issuedOn: localToday(),
                          method: "CASH",
                          reference: "",
                        })
                      }
                    >
                      Approve and record payout
                    </button>
                  </>
                )}
                {(l.status === "PENDING" || l.status === "ACTIVE") &&
                  can("payroll", "CREATE") && (
                    <button
                      className="btn border border-slate-300"
                      onClick={() =>
                        ask(
                          "cancel",
                          l.status === "ACTIVE"
                            ? "Why is this being cancelled? The payout will be voided in the Cash Book, so do this only if it was entered by mistake."
                            : "Why is this being cancelled?",
                        )
                      }
                    >
                      Cancel
                    </button>
                  )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

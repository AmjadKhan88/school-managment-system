import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { IssueItem, money } from "./shared";

interface Found {
  id: string;
  name: string;
  detail: string;
}
interface Summary {
  person: { name: string; detail: string };
  open: IssueItem[];
}
interface Outcome {
  daysLate: number;
  fines: { fineNo: string; reason: string; amount: string }[];
  copyRetired: boolean;
}

export default function ReturnPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [mode, setMode] = useState<"accession" | "borrower">("accession");
  const [accession, setAccession] = useState("");
  const [lookup, setLookup] = useState("");
  const [type, setType] = useState<"STUDENT" | "EMPLOYEE">("STUDENT");
  const [search, setSearch] = useState("");
  const [borrower, setBorrower] = useState<Found | null>(null);
  const [item, setItem] = useState<IssueItem | null>(null);
  const [dialog, setDialog] = useState<"damaged" | "lost" | null>(null);
  const [done, setDone] = useState<(Outcome & { title: string }) | null>(null);
  const ds = useDebounced(search.trim());

  const byAccession = useQuery({
    queryKey: ["library", "lookup", lookup],
    enabled: !!lookup,
    retry: false,
    queryFn: async () =>
      (
        await api.get<{ data: IssueItem }>("/library/issues/lookup", {
          params: { accessionNo: lookup },
        })
      ).data.data,
  });
  const found = useQuery({
    queryKey: ["library", "borrowers", type, ds],
    enabled: mode === "borrower" && ds.length >= 2 && !borrower,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/library/borrowers", {
          params: { type, q: ds },
        })
      ).data.data,
  });
  const summary = useQuery({
    queryKey: ["library", "borrower", type, borrower?.id],
    enabled: !!borrower,
    queryFn: async () =>
      (
        await api.get<{ data: Summary }>(
          `/library/borrowers/${type}/${borrower!.id}`,
        )
      ).data.data,
  });
  const current =
    item ?? (mode === "accession" ? (byAccession.data ?? null) : null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["library"] });

  const giveBack = useMutation({
    mutationFn: (v: {
      condition: "GOOD" | "DAMAGED";
      damageFine?: number;
      note?: string;
    }) =>
      api.post<{ data: Outcome }>(`/library/issues/${current!.id}/return`, v),
    onSuccess: (r) => {
      setDone({ ...r.data.data, title: current!.book.title });
      setItem(null);
      setDialog(null);
      setLookup("");
      setAccession("");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const renew = useMutation({
    mutationFn: () =>
      api.post<{ data: { dueDate: string } }>(
        `/library/issues/${current!.id}/renew`,
      ),
    onSuccess: (r) => {
      toast.success(`Renewed. Now due ${fmtDate(r.data.data.dueDate)}`);
      setItem(null);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const lost = useMutation({
    mutationFn: (v: { fineAmount?: number; note?: string }) =>
      api.post<{ data: { fineNo: string | null; amount: string } }>(
        `/library/issues/${current!.id}/lost`,
        v,
      ),
    onSuccess: (r) => {
      toast.success(
        r.data.data.fineNo
          ? `Marked lost. Fine ${r.data.data.fineNo} of ${money(r.data.data.amount)} raised.`
          : "Marked lost",
      );
      setItem(null);
      setDialog(null);
      setLookup("");
      setAccession("");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reset = () => {
    setItem(null);
    setDone(null);
  };
  return (
    <>
      <PageHeader
        title="Book Return"
        subtitle="Find the loan by accession number (scan it) or by borrower. Late fines are worked out from the due date."
      />
      <div className="card mb-4 p-5">
        <div role="group" className="mb-4 flex gap-2">
          {(
            [
              ["accession", "By accession number"],
              ["borrower", "By borrower"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mode === k}
              onClick={() => {
                setMode(k);
                reset();
              }}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-semibold",
                mode === k
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-500",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {mode === "accession" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reset();
              setLookup(accession.trim().toUpperCase());
            }}
            className="flex gap-2"
          >
            <input
              className="input max-w-xs font-mono uppercase"
              autoFocus
              placeholder="LB-000123"
              value={accession}
              onChange={(e) => setAccession(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={accession.trim().length < 3}
            >
              <Search size={16} />
              Find loan
            </button>
          </form>
        ) : (
          <>
            <div role="group" className="mb-2 flex gap-2">
              {(["STUDENT", "EMPLOYEE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => {
                    setType(t);
                    setBorrower(null);
                    setSearch("");
                    reset();
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-semibold",
                    type === t
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500",
                  )}
                >
                  {t === "STUDENT" ? "Student" : "Staff"}
                </button>
              ))}
            </div>
            {borrower ? (
              <div className="flex max-w-md items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
                <span>
                  <strong>{borrower.name}</strong> · {borrower.detail}
                </span>
                <button
                  className="text-xs font-semibold text-brand-700 hover:underline"
                  onClick={() => {
                    setBorrower(null);
                    reset();
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="max-w-md">
                <input
                  className="input"
                  placeholder="Name or number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <ul className="mt-2 space-y-1">
                  {found.data?.map((f) => (
                    <li key={f.id}>
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => setBorrower(f)}
                      >
                        <span className="font-semibold">{f.name}</span>
                        <span className="block text-xs text-slate-500">
                          {f.detail}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.data && (
              <ul className="mt-3 divide-y divide-line text-sm">
                {summary.data.open.length === 0 && (
                  <li className="py-2 text-slate-500">No books out.</li>
                )}
                {summary.data.open.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span>
                      {o.book.title}
                      <span className="block text-xs text-slate-500">
                        {o.accessionNo} · due {fmtDate(o.dueDate)}
                        {o.daysLate > 0 ? ` · ${o.daysLate} d late` : ""}
                      </span>
                    </span>
                    <button
                      className="btn border border-slate-300 py-1.5"
                      onClick={() => {
                        setItem(o);
                        setDone(null);
                      }}
                    >
                      Select
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {mode === "accession" && lookup && byAccession.isLoading && (
          <Loader2 className="mt-4 animate-spin text-slate-400" />
        )}
        {mode === "accession" && lookup && byAccession.isError && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {apiMessage(byAccession.error, "Could not find that loan")}
          </p>
        )}
      </div>

      {done && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-bold">
            {done.title} is back
            {done.copyRetired
              ? " (this damaged copy was withdrawn)"
              : " on the shelf"}
            .
          </p>
          {done.fines.length === 0 ? (
            <p className="mt-1">No fine.</p>
          ) : (
            <ul className="mt-1 list-disc pl-5">
              {done.fines.map((f) => (
                <li key={f.fineNo}>
                  Fine {f.fineNo}: {money(f.amount)} ({f.reason.toLowerCase()}).
                  Collect it under Library Fines.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {current && (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-ink-950">
                {current.book.title}
              </p>
              <p className="text-sm text-slate-600">
                {current.book.author} · copy {current.accessionNo} ·{" "}
                {current.issueNo}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                current.daysLate > 0
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700",
              )}
            >
              {current.daysLate > 0
                ? `${current.daysLate} day${current.daysLate === 1 ? "" : "s"} overdue`
                : "On time"}
            </span>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold text-slate-500">Borrower</dt>
              <dd>
                {current.borrower.name}
                <span className="block text-xs text-slate-500">
                  {current.borrower.detail}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Issued</dt>
              <dd>{fmtDate(current.issuedOn)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Due</dt>
              <dd>
                {fmtDate(current.dueDate)}
                {current.renewals > 0 ? ` (renewed ${current.renewals}×)` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">
                Late fine if returned today
              </dt>
              <dd className="font-bold">{money(current.fineSoFar)}</dd>
            </div>
          </dl>
          {can("library", "EDIT") && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={giveBack.isPending}
                onClick={() => giveBack.mutate({ condition: "GOOD" })}
              >
                {giveBack.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Return in good condition
              </button>
              <button
                className="btn border border-slate-300"
                onClick={() => setDialog("damaged")}
              >
                Return damaged
              </button>
              <button
                className="btn border border-slate-300"
                disabled={renew.isPending || current.daysLate > 0}
                onClick={() => renew.mutate()}
                title={
                  current.daysLate > 0 ? "Overdue books cannot be renewed" : ""
                }
              >
                Renew
              </button>
              <button
                className="btn border border-rose-300 text-rose-600"
                onClick={() => setDialog("lost")}
              >
                Mark as lost
              </button>
            </div>
          )}
        </div>
      )}
      {dialog === "damaged" && current && (
        <AmountDialog
          title="Return a damaged book"
          lead="The copy is taken out of circulation. Charge a damage fine if you wish."
          label="Damage fine (optional)"
          confirm="Return"
          busy={giveBack.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(amount, note) =>
            giveBack.mutate({ condition: "DAMAGED", damageFine: amount, note })
          }
        />
      )}
      {dialog === "lost" && current && (
        <AmountDialog
          title="Mark as lost"
          lead="The loan is closed and the copy is recorded as lost. A fine is raised for its replacement. Leave the amount empty to use the book's price."
          label="Replacement amount"
          confirm="Mark as lost"
          busy={lost.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(amount, note) => lost.mutate({ fineAmount: amount, note })}
        />
      )}
    </>
  );
}

function AmountDialog({
  title,
  lead,
  label,
  confirm,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  lead: string;
  label: string;
  confirm: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (amount: number | undefined, note: string | undefined) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            amount === "" ? undefined : Number(amount),
            note.trim() || undefined,
          );
        }}
        className="card w-full max-w-sm p-6"
      >
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
        <p className="mt-1 text-sm text-slate-600">{lead}</p>
        <div className="mt-4 space-y-4">
          <Field label={label}>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input mt-1.5 font-normal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <input
              className="input mt-1.5 font-normal"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
          <button className="btn-primary" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {confirm}
          </button>
        </div>
      </form>
    </div>
  );
}

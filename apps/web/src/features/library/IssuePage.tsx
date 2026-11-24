import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { IssueItem, money } from "./shared";

type BType = "STUDENT" | "EMPLOYEE";
interface Found {
  id: string;
  name: string;
  detail: string;
}
interface Summary {
  person: { name: string; detail: string };
  limits: { max: number; loanDays: number; maxRenewals: number };
  open: IssueItem[];
  history: IssueItem[];
  unpaid: {
    total: string;
    items: { id: string; fineNo: string; reason: string; amount: string }[];
  };
}
interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  shelfLocation: string | null;
  available: number;
}

export default function IssuePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [type, setType] = useState<BType>("STUDENT");
  const [search, setSearch] = useState("");
  const [borrower, setBorrower] = useState<Found | null>(null);
  const [bookSearch, setBookSearch] = useState("");
  const [book, setBook] = useState<BookRow | null>(null);
  const [accession, setAccession] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [last, setLast] = useState<{
    issueNo: string;
    title: string;
    dueDate: string;
    accessionNo: string;
  } | null>(null);
  const ds = useDebounced(search.trim());
  const db = useDebounced(bookSearch.trim());

  const found = useQuery({
    queryKey: ["library", "borrowers", type, ds],
    enabled: ds.length >= 2 && !borrower,
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
  const books = useQuery({
    queryKey: ["library", "issue-books", db],
    enabled: db.length >= 2 && !book,
    queryFn: async () =>
      (
        await api.get<{ data: { items: BookRow[] } }>("/library/books", {
          params: { q: db, status: "ACTIVE", pageSize: 8 },
        })
      ).data.data.items,
  });

  const s = summary.data;
  const blockedBy =
    s &&
    (Number(s.unpaid.total) > 0
      ? `Unpaid fines of ${money(s.unpaid.total)}. Collect or waive them under Library Fines.`
      : s.open.some((o) => o.daysLate > 0)
        ? "Has overdue books that must be returned first."
        : s.open.length >= s.limits.max
          ? `Already has ${s.open.length} book(s) out (limit ${s.limits.max}).`
          : null);

  const issue = useMutation({
    mutationFn: () =>
      api.post<{
        data: {
          issueNo: string;
          title: string;
          dueDate: string;
          accessionNo: string;
        };
      }>("/library/issues", {
        borrowerType: type,
        studentId: type === "STUDENT" ? borrower!.id : undefined,
        employeeId: type === "EMPLOYEE" ? borrower!.id : undefined,
        bookId: accession.trim() ? undefined : book?.id,
        accessionNo: accession.trim() || undefined,
        dueDate: dueDate || undefined,
      }),
    onSuccess: (r) => {
      setLast(r.data.data);
      setBook(null);
      setBookSearch("");
      setAccession("");
      setDueDate("");
      qc.invalidateQueries({ queryKey: ["library"] });
      toast.success(`Issued ${r.data.data.title}`);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const switchType = (t: BType) => {
    setType(t);
    setBorrower(null);
    setSearch("");
    setLast(null);
  };

  return (
    <>
      <PageHeader
        title="Book Issue"
        subtitle="Choose the borrower, then the book (or scan its accession number)."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <section className="card p-5">
          <div role="group" className="mb-3 flex gap-2">
            {(["STUDENT", "EMPLOYEE"] as BType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => switchType(t)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold",
                  type === t
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-500",
                )}
              >
                {t === "STUDENT" ? "Student" : "Staff or teacher"}
              </button>
            ))}
          </div>
          {borrower ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <span>
                <strong>{borrower.name}</strong> · {borrower.detail}
              </span>
              <button
                className="text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => {
                  setBorrower(null);
                  setLast(null);
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="input pl-9"
                  autoFocus
                  placeholder={
                    type === "STUDENT"
                      ? "Student name or admission number"
                      : "Name or employee number"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
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
                {found.data?.length === 0 && (
                  <li className="px-1 text-sm text-slate-500">Nobody found.</li>
                )}
              </ul>
            </>
          )}

          {summary.isLoading && (
            <Loader2 className="mx-auto mt-6 animate-spin text-slate-400" />
          )}
          {s && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                {s.open.length} of {s.limits.max} books out · loan period{" "}
                {s.limits.loanDays} days
              </p>
              {blockedBy && (
                <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {blockedBy}
                </p>
              )}
              <div>
                <h3 className="text-sm font-bold text-ink-950">
                  Books out now
                </h3>
                {s.open.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">None.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-line text-sm">
                    {s.open.map((o) => (
                      <li
                        key={o.id}
                        className="flex justify-between gap-3 py-1.5"
                      >
                        <span>
                          {o.book.title}
                          <span className="block text-xs text-slate-500">
                            {o.accessionNo}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "whitespace-nowrap text-xs",
                            o.daysLate > 0
                              ? "font-semibold text-rose-600"
                              : "text-slate-500",
                          )}
                        >
                          due {fmtDate(o.dueDate)}
                          {o.daysLate > 0 ? ` · ${o.daysLate} d late` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-bold text-ink-950">
                  History ({s.history.length})
                </summary>
                <ul className="mt-1 divide-y divide-line text-xs">
                  {s.history.length === 0 && (
                    <li className="py-2 text-slate-500">No earlier loans.</li>
                  )}
                  {s.history.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between gap-3 py-1.5"
                    >
                      <span>{o.book.title}</span>
                      <span className="whitespace-nowrap text-slate-500">
                        {fmtDate(o.issuedOn)} to{" "}
                        {o.returnedOn ? fmtDate(o.returnedOn) : "—"}
                        {o.status === "LOST" ? " · lost" : ""}
                        {o.daysLate > 0 ? ` · ${o.daysLate} d late` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-ink-950">Book</h2>
          {!borrower && (
            <p className="mt-2 text-sm text-slate-500">
              Choose a borrower first.
            </p>
          )}
          {borrower && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                issue.mutate();
              }}
              className="mt-3 space-y-4"
            >
              {book ? (
                <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
                  <span>
                    <strong>{book.title}</strong> · {book.author}
                    <span className="block text-xs text-slate-600">
                      {book.available} on the shelf
                      {book.shelfLocation ? ` · ${book.shelfLocation}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-700 hover:underline"
                    onClick={() => setBook(null)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Field label="Find a book">
                    <input
                      className="input mt-1.5 font-normal"
                      placeholder="Title, author or ISBN"
                      value={bookSearch}
                      disabled={!!accession.trim()}
                      onChange={(e) => setBookSearch(e.target.value)}
                    />
                  </Field>
                  <ul className="space-y-1">
                    {books.data?.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          disabled={b.available === 0}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => setBook(b)}
                        >
                          <span className="font-semibold">{b.title}</span>
                          <span className="block text-xs text-slate-500">
                            {b.author} ·{" "}
                            {b.available > 0
                              ? `${b.available} on the shelf`
                              : "none on the shelf"}
                          </span>
                        </button>
                      </li>
                    ))}
                    {books.data?.length === 0 && (
                      <li className="px-1 text-sm text-slate-500">
                        No book found.
                      </li>
                    )}
                  </ul>
                </>
              )}
              <Field label="Or scan or type an accession number">
                <input
                  className="input mt-1.5 font-mono font-normal uppercase"
                  placeholder="LB-000123"
                  value={accession}
                  disabled={!!book}
                  onChange={(e) => setAccession(e.target.value)}
                />
              </Field>
              <Field label="Due date (leave empty for the usual loan period)">
                <input
                  type="date"
                  min={localToday()}
                  className="input mt-1.5 font-normal"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              {can("library", "CREATE") && (
                <button
                  className="btn-primary"
                  disabled={
                    issue.isPending ||
                    (!book && !accession.trim()) ||
                    !!blockedBy
                  }
                >
                  {issue.isPending && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  Issue book
                </button>
              )}
            </form>
          )}
          {last && (
            <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Issued <strong>{last.title}</strong> ({last.accessionNo}) as{" "}
              {last.issueNo}. Due <strong>{fmtDate(last.dueDate)}</strong>.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { COPY_STYLE, useCategories } from "./shared";

interface Copy {
  id: string;
  accessionNo: string;
  status: string;
  note: string | null;
  book: {
    id: string;
    title: string;
    author: string;
    shelfLocation: string | null;
    category: { name: string };
  };
  borrower: { name: string; detail: string; dueDate: string } | null;
}
interface Paged {
  items: Copy[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    available: number;
    issued: number;
    lost: number;
    withdrawn: number;
  };
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [sp, setSp] = useSearchParams();
  const bookId = sp.get("bookId") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const categories = useCategories();
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const params = {
    q: dq || undefined,
    status: status || undefined,
    categoryId: categoryId || undefined,
    bookId: bookId || undefined,
    page,
    pageSize: 25,
  };
  const list = useQuery({
    queryKey: ["library", "copies", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/library/copies", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  const act = useMutation({
    mutationFn: (v: {
      id: string;
      action: "withdraw" | "restore";
      note?: string;
    }) => api.post(`/library/copies/${v.id}/${v.action}`, { note: v.note }),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "withdraw" ? "Copy withdrawn" : "Copy back on the shelf",
      );
      qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const withdraw = (c: Copy) => {
    const note = window.prompt(
      `Why is ${c.accessionNo} being withdrawn? (for example worn out)`,
    );
    if (note !== null)
      act.mutate({
        id: c.id,
        action: "withdraw",
        note: note.trim() || undefined,
      });
  };

  return (
    <>
      <PageHeader
        title="Book Inventory"
        subtitle="Every physical copy: where it is and who has it."
      />
      {d && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ["AVAILABLE", d.summary.available],
              ["ISSUED", d.summary.issued],
              ["LOST", d.summary.lost],
              ["WITHDRAWN", d.summary.withdrawn],
            ] as [string, number][]
          ).map(([s, v]) => (
            <button
              key={s}
              onClick={() => reset(setStatus)(status === s ? "" : s)}
              className={cn(
                "card p-3 text-left",
                status === s && "ring-2 ring-brand-500",
              )}
            >
              <p className="text-xs font-semibold text-slate-500">
                {COPY_STYLE[s][0]}
              </p>
              <p className="mt-0.5 text-xl font-extrabold text-ink-950">{v}</p>
            </button>
          ))}
        </div>
      )}
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Accession no, title or author"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={categoryId}
          onChange={(e) => reset(setCategoryId)(e.target.value)}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {bookId ? (
          <button
            className="btn border border-slate-300"
            onClick={() => setSp({})}
          >
            Showing one book. Show all copies
          </button>
        ) : (
          <select
            className="input"
            value={status}
            onChange={(e) => reset(setStatus)(e.target.value)}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {Object.entries(COPY_STYLE).map(([k, v]) => (
              <option key={k} value={k}>
                {v[0]}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {["Accession", "Book", "Category", "Shelf", "Status", "With"].map(
                (h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3">
                    {h}
                  </th>
                ),
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
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
                  colSpan={7}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load copies")}
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No copies match.
                </td>
              </tr>
            )}
            {d?.items.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                  {c.accessionNo}
                </td>
                <td className="px-4 py-3">
                  {c.book.title}
                  <span className="block text-xs text-slate-500">
                    {c.book.author}
                  </span>
                </td>
                <td className="px-4 py-3">{c.book.category.name}</td>
                <td className="px-4 py-3">{c.book.shelfLocation ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      COPY_STYLE[c.status][1],
                    )}
                  >
                    {COPY_STYLE[c.status][0]}
                  </span>
                  {c.note && (
                    <span className="block text-xs text-slate-500">
                      {c.note}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.borrower ? (
                    <>
                      {c.borrower.name}
                      <span className="block text-slate-500">
                        {c.borrower.detail} · due {fmtDate(c.borrower.dueDate)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {can("library", "EDIT") && c.status === "AVAILABLE" && (
                    <button
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() => withdraw(c)}
                    >
                      Withdraw
                    </button>
                  )}
                  {can("library", "EDIT") &&
                    (c.status === "WITHDRAWN" || c.status === "LOST") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        onClick={() =>
                          window.confirm(
                            `Put ${c.accessionNo} back on the shelf?`,
                          ) && act.mutate({ id: c.id, action: "restore" })
                        }
                      >
                        Put back
                      </button>
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
    </>
  );
}

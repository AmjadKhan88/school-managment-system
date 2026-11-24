import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { money, useCategories } from "./shared";

interface Book {
  id: string;
  isbn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  edition: string | null;
  publishedYear: number | null;
  language: string | null;
  category: { id: string; name: string };
  shelfLocation: string | null;
  price: string | null;
  description: string | null;
  isActive: boolean;
  available: number;
  issued: number;
  lost: number;
  withdrawn: number;
  copies: number;
}
interface Paged {
  items: Book[];
  total: number;
  page: number;
  pageSize: number;
}

export default function BooksPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availability, setAvailability] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Book | "new" | null>(null);
  const [copiesFor, setCopiesFor] = useState<Book | null>(null);
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
    categoryId: categoryId || undefined,
    availability: availability || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["library", "books", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/library/books", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const refresh = () => qc.invalidateQueries({ queryKey: ["library"] });

  return (
    <>
      <PageHeader
        title="Books"
        subtitle="Register titles and their copies. Each copy gets its own accession number."
        actions={
          can("library", "CREATE") && (
            <button className="btn-primary" onClick={() => setDialog("new")}>
              <Plus size={16} />
              Register book
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
            placeholder="Title, author, ISBN or accession no"
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
        <select
          className="input"
          value={availability}
          onChange={(e) => reset(setAvailability)(e.target.value)}
          aria-label="Availability"
        >
          <option value="">Any availability</option>
          <option value="available">Has copies on the shelf</option>
          <option value="none">None on the shelf</option>
        </select>
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">Active and inactive</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {["Book", "Category", "Shelf", "Copies"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th />
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
                  {apiMessage(list.error, "Could not load books")}
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No books match.{" "}
                  {can("library", "CREATE") && "Register the first one."}
                </td>
              </tr>
            )}
            {d?.items.map((b) => (
              <tr
                key={b.id}
                className={cn(
                  "border-b border-line last:border-0",
                  !b.isActive && "text-slate-400",
                )}
              >
                <td className="px-4 py-3">
                  <span className="font-semibold">{b.title}</span>
                  {!b.isActive && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px]">
                      Inactive
                    </span>
                  )}
                  <span className="block text-xs text-slate-500">
                    {b.author}
                    {b.isbn ? ` · ISBN ${b.isbn}` : ""}
                    {b.publisher ? ` · ${b.publisher}` : ""}
                  </span>
                </td>
                <td className="px-4 py-3">{b.category.name}</td>
                <td className="px-4 py-3">{b.shelfLocation ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <strong
                    className={
                      b.available > 0 ? "text-emerald-700" : "text-rose-600"
                    }
                  >
                    {b.available}
                  </strong>{" "}
                  of {b.copies} on shelf
                  {b.lost > 0 && (
                    <span className="block text-xs text-rose-600">
                      {b.lost} lost
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Link
                      to={`/library/inventory?bookId=${b.id}`}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      Copies
                    </Link>
                    {can("library", "CREATE") && b.isActive && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        onClick={() => setCopiesFor(b)}
                      >
                        <Copy size={13} className="mr-1 inline" />
                        Add copies
                      </button>
                    )}
                    {can("library", "EDIT") && (
                      <button
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        onClick={() => setDialog(b)}
                        aria-label={`Edit ${b.title}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
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

      {dialog && (
        <BookDialog
          book={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {copiesFor && (
        <CopiesDialog
          book={copiesFor}
          onClose={() => setCopiesFor(null)}
          onSaved={() => {
            setCopiesFor(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function BookDialog({
  book,
  onClose,
  onSaved,
}: {
  book: Book | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const categories = useCategories();
  const [f, setF] = useState({
    isbn: book?.isbn ?? "",
    title: book?.title ?? "",
    author: book?.author ?? "",
    publisher: book?.publisher ?? "",
    edition: book?.edition ?? "",
    publishedYear: book?.publishedYear ? String(book.publishedYear) : "",
    language: book?.language ?? "",
    categoryId: book?.category.id ?? "",
    shelfLocation: book?.shelfLocation ?? "",
    price: book?.price ?? "",
    description: book?.description ?? "",
    isActive: book?.isActive ?? true,
    copies: "1",
  });
  const set =
    (k: keyof typeof f) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const { copies, ...rest } = f;
      const body = {
        ...rest,
        publishedYear: f.publishedYear || undefined,
        price: f.price || undefined,
      };
      return book
        ? api.put(`/library/books/${book.id}`, body)
        : api.post<{ data: { accessionNos: string[] } }>("/library/books", {
            ...body,
            copies: Number(copies),
          });
    },
    onSuccess: (res) => {
      const nos = (res.data as { data?: { accessionNos?: string[] } }).data
        ?.accessionNos;
      toast.success(
        book
          ? "Book updated"
          : nos?.length
            ? `Registered with ${nos.length} cop${nos.length === 1 ? "y" : "ies"} (${nos[0]}${nos.length > 1 ? ` to ${nos[nos.length - 1]}` : ""})`
            : "Book registered",
      );
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
          save.mutate();
        }}
        className="card w-full max-w-2xl p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {book ? "Edit book" : "Register book"}
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Title *" className="sm:col-span-2">
            <input
              required
              className="input mt-1.5 font-normal"
              value={f.title}
              onChange={set("title")}
            />
          </Field>
          <Field label="Author *">
            <input
              required
              className="input mt-1.5 font-normal"
              value={f.author}
              onChange={set("author")}
            />
          </Field>
          <Field label="ISBN">
            <input
              className="input mt-1.5 font-normal"
              placeholder="978-0-306-40615-7"
              value={f.isbn}
              onChange={set("isbn")}
            />
          </Field>
          <Field label="Category *">
            <select
              required
              className="input mt-1.5 font-normal"
              value={f.categoryId}
              onChange={set("categoryId")}
            >
              <option value="">Select…</option>
              {categories.data
                ?.filter((c) => c.isActive || c.id === f.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Publisher">
            <input
              className="input mt-1.5 font-normal"
              value={f.publisher}
              onChange={set("publisher")}
            />
          </Field>
          <Field label="Edition">
            <input
              className="input mt-1.5 font-normal"
              value={f.edition}
              onChange={set("edition")}
            />
          </Field>
          <Field label="Year published">
            <input
              type="number"
              className="input mt-1.5 font-normal"
              value={f.publishedYear}
              onChange={set("publishedYear")}
            />
          </Field>
          <Field label="Language">
            <input
              className="input mt-1.5 font-normal"
              value={f.language}
              onChange={set("language")}
            />
          </Field>
          <Field label="Shelf location">
            <input
              className="input mt-1.5 font-normal"
              placeholder="Rack B, shelf 2"
              value={f.shelfLocation}
              onChange={set("shelfLocation")}
            />
          </Field>
          <Field label="Price (charged if lost)">
            <input
              type="number"
              min="0"
              step="0.01"
              className="input mt-1.5 font-normal"
              value={f.price}
              onChange={set("price")}
            />
          </Field>
          {!book && (
            <Field label="Copies to register">
              <input
                type="number"
                min="0"
                max="200"
                className="input mt-1.5 font-normal"
                value={f.copies}
                onChange={set("copies")}
              />
            </Field>
          )}
          <Field label="Description" className="sm:col-span-2">
            <textarea
              rows={2}
              className="input mt-1.5 font-normal"
              value={f.description}
              onChange={set("description")}
            />
          </Field>
          {book && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={f.isActive}
                onChange={(e) =>
                  setF((s) => ({ ...s, isActive: e.target.checked }))
                }
              />
              Active (can be issued)
            </label>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function CopiesDialog({
  book,
  onClose,
  onSaved,
}: {
  book: Book;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [count, setCount] = useState("1");
  const save = useMutation({
    mutationFn: () =>
      api.post<{ data: { accessionNos: string[] } }>(
        `/library/books/${book.id}/copies`,
        { count: Number(count) },
      ),
    onSuccess: (r) => {
      const n = r.data.data.accessionNos;
      toast.success(
        `Added ${n.length} cop${n.length === 1 ? "y" : "ies"}: ${n[0]}${n.length > 1 ? ` to ${n[n.length - 1]}` : ""}`,
      );
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-sm p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Add copies</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {book.title} · now {book.copies} cop{book.copies === 1 ? "y" : "ies"}
          {book.price ? ` · price ${money(book.price)}` : ""}
        </p>
        <Field label="How many copies? *" className="mt-4">
          <input
            required
            autoFocus
            type="number"
            min="1"
            max="100"
            className="input mt-1.5 font-normal"
            value={count}
            onChange={(e) => setCount(e.target.value)}
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
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

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
  FileSpreadsheet,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import {
  fmtMoney,
  METHOD_LABEL,
  Method,
  NEEDS_REFERENCE,
} from "@/features/fees/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { localToday } from "./shared";

type EStatus = "PENDING" | "APPROVED" | "REJECTED" | "VOIDED";
const STATUS_STYLE: Record<EStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  VOIDED: "bg-slate-200 text-slate-500",
};
const STATUS_LABEL: Record<EStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  VOIDED: "Voided",
};

interface Row {
  id: string;
  expenseNo: string;
  description: string;
  amount: string;
  expenseDate: string;
  method: Method;
  paidTo: string | null;
  reference: string | null;
  status: EStatus;
  rejectionReason: string | null;
  voidReason: string | null;
  categoryId: string;
  categoryName: string;
  attachmentCount: number;
  createdBy: string | null;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    approvedTotal: string;
    pendingCount: number;
    pendingTotal: string;
  };
}
interface Category {
  id: string;
  name: string;
  isActive: boolean;
}
interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}
interface Detail extends Row {
  attachments: Attachment[];
}

const kb = (n: number) =>
  n >= 1_048_576
    ? `${(n / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

async function openReceipt(id: string) {
  try {
    const res = await api.get<Blob>(`/finance/expenses/attachments/${id}`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    toast.error("Could not open the receipt");
  }
}

export default function ExpensesPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);

  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<string | "new" | null>(null);
  const [exporting, setExporting] = useState(false);
  const dq = useDebounced(q);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const categories = useQuery({
    queryKey: ["finance", "expense-categories"],
    queryFn: async () =>
      (await api.get<{ data: Category[] }>("/finance/expense-categories")).data
        .data,
  });
  const filters = {
    q: dq || undefined,
    categoryId: categoryId || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const params = { ...filters, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ["finance", "expenses", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/finance/expenses", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  const act = useMutation({
    mutationFn: (v: {
      id: string;
      action: "approve" | "reject" | "void";
      reason?: string;
    }) =>
      api.post(
        `/finance/expenses/${v.id}/${v.action}`,
        v.reason ? { reason: v.reason } : undefined,
      ),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "approve"
          ? "Expense approved"
          : v.action === "reject"
            ? "Expense rejected"
            : "Expense voided",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const withReason = (
    id: string,
    action: "reject" | "void",
    prompt: string,
  ) => {
    const reason = window.prompt(prompt);
    if (reason && reason.trim().length >= 3)
      act.mutate({ id, action, reason: reason.trim() });
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile("/finance/expenses/export", filters, "expenses.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Record school spending. Approved expenses count in the cash book and reports."
        actions={
          <div className="flex flex-wrap gap-2">
            {can("expenses", "EXPORT") && (
              <button
                className="btn border border-slate-300"
                onClick={exportXlsx}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={16} />
                )}
                Export Excel
              </button>
            )}
            {can("expenses", "CREATE") && (
              <button className="btn-primary" onClick={() => setDialog("new")}>
                <Plus size={16} />
                Add expense
              </button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">
            Approved (this filter)
          </p>
          <p className="mt-1 text-xl font-extrabold text-ink-950">
            {data ? fmtMoney(data.summary.approvedTotal) : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">
            Awaiting approval
          </p>
          <p className="mt-1 text-xl font-extrabold text-amber-600">
            {data
              ? `${data.summary.pendingCount} · ${fmtMoney(data.summary.pendingTotal)}`
              : "—"}
          </p>
        </div>
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search description, payee, no"
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
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as EStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="From date"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <input
          type="date"
          className="input"
          aria-label="To date"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Expense",
                "Date",
                "Category",
                "Description",
                "Paid to",
                "Amount",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
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
                  {apiMessage(list.error, "Could not load expenses")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No expenses match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.id}
                onClick={() => setDialog(r.id)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.expenseNo}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.expenseDate)}
                </td>
                <td className="px-4 py-3">{r.categoryName}</td>
                <td className="px-4 py-3">
                  {r.description}
                  {r.attachmentCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-slate-500">
                      <Paperclip size={12} />
                      {r.attachmentCount}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{r.paidTo ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {fmtMoney(r.amount)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <span className="block text-xs text-rose-600">
                      {r.rejectionReason}
                    </span>
                  )}
                  {r.status === "VOIDED" && r.voidReason && (
                    <span className="block text-xs text-slate-500">
                      {r.voidReason}
                    </span>
                  )}
                </td>
                <td
                  className="px-4 py-2 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex gap-1">
                    {r.status === "PENDING" && can("expenses", "APPROVE") && (
                      <>
                        <button
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          onClick={() =>
                            act.mutate({ id: r.id, action: "approve" })
                          }
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={() =>
                            withReason(
                              r.id,
                              "reject",
                              "Reason for rejecting this expense:",
                            )
                          }
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "APPROVED" && can("expenses", "APPROVE") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        onClick={() =>
                          withReason(
                            r.id,
                            "void",
                            "Reason for voiding this approved expense (it will be removed from the books):",
                          )
                        }
                      >
                        Void
                      </button>
                    )}
                  </div>
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

      {dialog && (
        <ExpenseDialog
          id={dialog === "new" ? null : dialog}
          categories={categories.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ExpenseDialog({
  id,
  categories,
  onClose,
  onSaved,
}: {
  id: string | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const detail = useQuery({
    queryKey: ["finance", "expense", id],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/finance/expenses/${id}`)).data.data,
  });
  const d = detail.data;

  const [f, setF] = useState({
    categoryId: "",
    description: "",
    amount: "",
    expenseDate: localToday(),
    method: "CASH" as Method,
    paidTo: "",
    reference: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!d) return;
    setF({
      categoryId: d.categoryId,
      description: d.description,
      amount: String(Number(d.amount)),
      expenseDate: d.expenseDate.slice(0, 10),
      method: d.method,
      paidTo: d.paidTo ?? "",
      reference: d.reference ?? "",
    });
  }, [d]);

  const editable =
    !id ||
    (!!d &&
      (d.status === "PENDING" || d.status === "REJECTED") &&
      can("expenses", "EDIT"));
  const canAttach = !!d
    ? (d.status === "PENDING" || d.status === "APPROVED") &&
      can("expenses", "EDIT")
    : true;
  const canRemove = !!d && d.status === "PENDING" && can("expenses", "EDIT");
  const set =
    (k: keyof typeof f) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));

  const existing = d?.attachments.length ?? 0;
  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (existing + files.length + picked.length > 5) {
      toast.error("An expense can have at most 5 receipts");
      return;
    }
    const big = picked.find((p) => p.size > 5 * 1024 * 1024);
    if (big) {
      toast.error(`${big.name} is larger than 5 MB`);
      return;
    }
    setFiles((s) => [...s, ...picked]);
  };

  const upload = async (expenseId: string, list: File[]) => {
    let failed = 0;
    for (const file of list) {
      const body = new FormData();
      body.append("file", file);
      try {
        await api.post(`/finance/expenses/${expenseId}/attachments`, body);
      } catch (e) {
        failed++;
        toast.error(`${file.name}: ${apiMessage(e, "upload failed")}`);
      }
    }
    return failed;
  };

  const removeReceipt = useMutation({
    mutationFn: (attId: string) =>
      api.delete(`/finance/expenses/attachments/${attId}`),
    onSuccess: () => {
      toast.success("Receipt removed");
      qc.invalidateQueries({ queryKey: ["finance", "expense", id] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) {
      toast.error("Enter an amount above 0");
      return;
    }
    if (NEEDS_REFERENCE.includes(f.method) && !f.reference.trim()) {
      toast.error("Enter the reference for this payment method");
      return;
    }
    setSaving(true);
    try {
      const body = {
        categoryId: f.categoryId,
        description: f.description,
        amount: Number(f.amount),
        expenseDate: f.expenseDate,
        method: f.method,
        paidTo: f.paidTo || undefined,
        reference: f.reference || undefined,
      };
      const saved = id
        ? await api.put<{ data: { id: string } }>(
            `/finance/expenses/${id}`,
            body,
          )
        : await api.post<{ data: { id: string } }>("/finance/expenses", body);
      const failed = await upload(saved.data.data.id, files);
      toast.success(
        failed
          ? "Expense saved, but some receipts failed to upload"
          : "Expense saved",
      );
      onSaved();
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addReceiptsOnly = async () => {
    if (!id || files.length === 0) return;
    setSaving(true);
    const failed = await upload(id, files);
    setSaving(false);
    setFiles([]);
    if (!failed) toast.success("Receipts added");
    qc.invalidateQueries({ queryKey: ["finance"] });
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={submit} className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {!id
              ? "Add expense"
              : d
                ? `${d.expenseNo}${editable ? "" : " (view only)"}`
                : "Expense"}
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
        {id && detail.isLoading && (
          <Loader2 className="mx-auto my-10 animate-spin text-slate-400" />
        )}
        {id && detail.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(detail.error, "Could not load the expense")}
          </p>
        )}

        {(!id || d) && (
          <>
            {d?.status === "REJECTED" && (
              <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                Rejected: {d.rejectionReason}. Saving sends it back for
                approval.
              </p>
            )}
            <fieldset
              disabled={!editable}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <Field label="Category *">
                <select
                  required
                  className="input mt-1.5 font-normal"
                  value={f.categoryId}
                  onChange={set("categoryId")}
                >
                  <option value="">Select…</option>
                  {categories
                    .filter((c) => c.isActive || c.id === f.categoryId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Amount *">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="input mt-1.5 font-normal"
                  value={f.amount}
                  onChange={set("amount")}
                />
              </Field>
              <Field label="Date *">
                <input
                  required
                  type="date"
                  max={localToday()}
                  className="input mt-1.5 font-normal"
                  value={f.expenseDate}
                  onChange={set("expenseDate")}
                />
              </Field>
              <Field label="Paid by *">
                <select
                  className="input mt-1.5 font-normal"
                  value={f.method}
                  onChange={set("method")}
                >
                  {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Paid to">
                <input
                  className="input mt-1.5 font-normal"
                  placeholder="Shop, utility company, person"
                  value={f.paidTo}
                  onChange={set("paidTo")}
                />
              </Field>
              {NEEDS_REFERENCE.includes(f.method) && (
                <Field
                  label={
                    f.method === "CHEQUE"
                      ? "Cheque number *"
                      : "Transaction reference *"
                  }
                >
                  <input
                    className="input mt-1.5 font-normal"
                    value={f.reference}
                    onChange={set("reference")}
                  />
                </Field>
              )}
              <Field label="Description *" className="sm:col-span-2">
                <textarea
                  required
                  minLength={3}
                  rows={2}
                  className="input mt-1.5 font-normal"
                  value={f.description}
                  onChange={set("description")}
                />
              </Field>
            </fieldset>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-ink-950">Receipts</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {d?.attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="flex items-center gap-2 font-semibold text-brand-700 hover:underline"
                      onClick={() => openReceipt(a.id)}
                    >
                      <Paperclip size={14} />
                      {a.fileName}
                      <span className="text-xs font-normal text-slate-500">
                        {kb(a.sizeBytes)}
                      </span>
                    </button>
                    {canRemove && (
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                        aria-label={`Remove ${a.fileName}`}
                        onClick={() =>
                          window.confirm("Remove this receipt?") &&
                          removeReceipt.mutate(a.id)
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
                {files.map((file, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2"
                  >
                    <span>
                      {file.name}{" "}
                      <span className="text-xs text-slate-500">
                        {kb(file.size)} · will upload on save
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                      aria-label={`Drop ${file.name}`}
                      onClick={() =>
                        setFiles((s) => s.filter((_, idx) => idx !== i))
                      }
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
                {existing === 0 && files.length === 0 && (
                  <li className="text-slate-500">No receipts attached.</li>
                )}
              </ul>
              {canAttach && existing + files.length < 5 && (
                <label className="btn mt-2 cursor-pointer border border-slate-300 py-1.5">
                  <Paperclip size={15} />
                  Attach receipt
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      pick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <p className="mt-1 text-xs text-slate-500">
                PDF, JPG, PNG or WebP, up to 5 MB each, at most 5 per expense.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={onClose}
              >
                Close
              </button>
              {editable ? (
                <button className="btn-primary" disabled={saving}>
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {id ? "Save changes" : "Save expense"}
                </button>
              ) : canAttach && files.length > 0 ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={addReceiptsOnly}
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  Upload receipts
                </button>
              ) : null}
            </div>
          </>
        )}
      </form>
    </div>
  );
}

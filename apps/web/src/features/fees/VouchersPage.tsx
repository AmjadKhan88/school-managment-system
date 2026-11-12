import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Gavel,
  Loader2,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate, useClasses, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { fmtMoney } from "./shared";

type Status = "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";
const STATUS_STYLE: Record<Status, string> = {
  OPEN: "bg-sky-100 text-sky-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};
const StatusBadge = ({ s }: { s: Status }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[s]}`}
  >
    {s.charAt(0) + s.slice(1).toLowerCase()}
  </span>
);

interface Row {
  id: string;
  invoiceNo: string;
  periodKey: string;
  dueDate: string;
  subtotal: string;
  discountTotal: string;
  fineAmount: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: Status;
  student: { id: string; admissionNo: string; fullName: string };
  className: string;
  section: string;
}
interface Summary {
  subtotal: string;
  discountTotal: string;
  fineAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstanding: string;
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  summary: Summary;
}
interface SectionOption {
  id: string;
  name: string;
}
interface Detail {
  id: string;
  invoiceNo: string;
  periodKey: string;
  issueDate: string;
  dueDate: string;
  status: Status;
  cancelReason: string | null;
  subtotal: string;
  discountTotal: string;
  fineAmount: string;
  totalAmount: string;
  paidAmount: string;
  previousBalance: string;
  balance: string;
  payable: string;
  items: {
    id: string;
    description: string;
    frequency: string;
    amount: string;
    discount: string;
  }[];
  adjustments: {
    id: string;
    type: "FINE_WAIVER" | "EXTRA_DISCOUNT";
    amount: string;
    reason: string;
  }[];
  student: {
    admissionNo: string;
    fullName: string;
    fatherName: string;
    guardians: { guardian: { fullName: string; phone: string } }[];
  };
  class: { name: string };
  section: { name: string };
}

const monthLabel = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function VouchersPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { user, sessionId: storeSession } = useAuth();

  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [periodKey, setPeriodKey] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

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
    sessionId: sessionId || undefined,
    periodKey: periodKey || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    status: status || undefined,
    q: dq || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["fees", "invoices", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/invoices", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const fines = useMutation({
    mutationFn: () =>
      api.post<{ data: { updated: number; fineAdded: string } }>(
        "/fees/invoices/apply-fines",
        { sessionId: sessionId || undefined },
      ),
    onSuccess: (r) => {
      toast.success(
        r.data.data.updated
          ? `Fines updated on ${r.data.data.updated} invoice(s): ${fmtMoney(r.data.data.fineAdded)} added`
          : "No new fines are due",
      );
      qc.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const s = data?.summary;
  const cards = [
    ["Invoiced", s?.totalAmount],
    ["Discounts given", s?.discountTotal],
    ["Late fines", s?.fineAmount],
    ["Collected", s?.paidAmount],
    ["Outstanding", s?.outstanding],
  ];

  return (
    <>
      <PageHeader
        title="Fee Vouchers"
        subtitle="Every invoice generated. Totals exclude cancelled invoices."
        actions={
          can("fees", "EDIT") && (
            <button
              className="btn border border-slate-300"
              disabled={fines.isPending}
              onClick={() =>
                window.confirm(
                  "Recalculate late fines on all overdue unpaid invoices?",
                ) && fines.mutate()
              }
            >
              {fines.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Gavel size={16} />
              )}
              Apply late fines
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map(([l, v]) => (
          <div key={l} className="card p-4">
            <p className="text-xs font-semibold text-slate-500">{l}</p>
            <p className="mt-1 text-lg font-extrabold text-ink-950">
              {s ? fmtMoney(v) : "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select
          className="input"
          value={sessionId}
          onChange={(e) => reset(setSessionId)(e.target.value)}
          aria-label="Session"
        >
          <option value="">All sessions</option>
          {user?.sessions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          className="input"
          value={periodKey}
          onChange={(e) => reset(setPeriodKey)(e.target.value)}
          aria-label="Fee month"
        />
        <select
          className="input"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSectionId("");
            setPage(1);
          }}
          aria-label="Class"
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
          aria-label="Section"
        >
          <option value="">{classId ? "All sections" : "Pick a class"}</option>
          {sections.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
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
          <option value="OPEN">Open</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Name or admission no"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Invoice",
                "Month",
                "Student",
                "Class",
                "Due",
                "Total",
                "Paid",
                "Balance",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
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
                  colSpan={9}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load vouchers")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No vouchers match these filters. Generate some under Monthly
                  Fee Generation.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold">
                  {r.invoiceNo}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {monthLabel(r.periodKey)}
                </td>
                <td className="px-4 py-3">
                  {r.student.fullName}
                  <span className="block text-xs text-slate-500">
                    {r.student.admissionNo}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.className} / {r.section}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(r.dueDate)}
                </td>
                <td className="px-4 py-3">
                  {fmtMoney(r.totalAmount)}
                  {Number(r.fineAmount) > 0 && (
                    <span className="block text-xs text-rose-600">
                      incl. fine {fmtMoney(r.fineAmount)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{fmtMoney(r.paidAmount)}</td>
                <td className="px-4 py-3 font-semibold">
                  {r.status === "CANCELLED" ? "—" : fmtMoney(r.balance)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge s={r.status} />
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

      {openId && <VoucherDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function VoucherDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const detail = useQuery({
    queryKey: ["fees", "invoice", id],
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/fees/invoices/${id}`)).data.data,
  });
  const d = detail.data;

  const cancel = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/fees/invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["fees"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const print = () => {
    document.body.classList.add("print-voucher");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("print-voucher"),
      { once: true },
    );
    window.print();
  };
  const askCancel = () => {
    const reason = window.prompt(
      "Reason for cancelling this invoice (the month can then be generated again):",
    );
    if (reason && reason.trim().length >= 3) cancel.mutate(reason.trim());
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
        <div className="no-print flex items-center justify-between">
          <h2 className="text-lg font-bold">Fee voucher</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {detail.isLoading && (
          <Loader2 className="mx-auto my-10 animate-spin text-slate-400" />
        )}
        {detail.isError && (
          <p className="mt-4 text-sm text-rose-600">
            {apiMessage(detail.error, "Could not load the voucher")}
          </p>
        )}
        {d && (
          <>
            <div id="voucher" className="mt-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500">Invoice</p>
                  <p className="text-lg font-extrabold">{d.invoiceNo}</p>
                </div>
                <StatusBadge s={d.status} />
              </div>
              <p className="mt-2 text-sm font-semibold">
                {monthLabel(d.periodKey)} · Due {fmtDate(d.dueDate)}
              </p>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-bold">{d.student.fullName}</p>
                <p className="text-slate-600">
                  {d.student.admissionNo} · {d.class.name} / {d.section.name} ·
                  Father: {d.student.fatherName}
                </p>
                {d.student.guardians[0] && (
                  <p className="text-slate-600">
                    Contact: {d.student.guardians[0].guardian.phone}
                  </p>
                )}
              </div>
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="py-2">{i.description}</td>
                      <td className="py-2 text-right">{fmtMoney(i.amount)}</td>
                      <td className="py-2 text-right">
                        {Number(i.discount) ? `-${fmtMoney(i.discount)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {d.adjustments.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  {d.adjustments.map((a) => (
                    <li key={a.id}>
                      {a.type === "FINE_WAIVER"
                        ? "Fine waived"
                        : "Extra discount"}{" "}
                      {fmtMoney(a.amount)}: {a.reason}
                    </li>
                  ))}
                </ul>
              )}

              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {(
                  [
                    ["Fees", d.subtotal],
                    [
                      "Discounts",
                      Number(d.discountTotal)
                        ? `-${fmtMoney(d.discountTotal)}`
                        : null,
                    ],
                    ["Late fine", Number(d.fineAmount) ? d.fineAmount : null],
                    ["This invoice", d.totalAmount],
                    ["Paid", d.paidAmount],
                  ] as [string, string | null][]
                )
                  .filter(([, v]) => v !== null)
                  .map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <dt className="text-slate-600">{l}</dt>
                      <dd>{String(v).startsWith("-") ? v : fmtMoney(v)}</dd>
                    </div>
                  ))}
                <div className="flex justify-between font-semibold">
                  <dt>Balance on this invoice</dt>
                  <dd>{fmtMoney(d.balance)}</dd>
                </div>
                {Number(d.previousBalance) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <dt>Previous dues (earlier months)</dt>
                    <dd>{fmtMoney(d.previousBalance)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold">
                  <dt>Total payable</dt>
                  <dd>{fmtMoney(d.payable)}</dd>
                </div>
              </dl>
              {d.status === "CANCELLED" && (
                <p className="mt-3 text-sm text-rose-600">
                  Cancelled: {d.cancelReason}
                </p>
              )}
            </div>
            <div className="no-print mt-5 flex flex-wrap justify-end gap-2">
              {can("fees", "DELETE") &&
                d.status === "OPEN" &&
                Number(d.paidAmount) === 0 && (
                  <button
                    className="btn border border-rose-300 text-rose-600"
                    onClick={askCancel}
                    disabled={cancel.isPending}
                  >
                    Cancel invoice
                  </button>
                )}
              {can("fees", "VIEW") && (
                <button className="btn-primary" onClick={print}>
                  <Printer size={16} />
                  Print
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

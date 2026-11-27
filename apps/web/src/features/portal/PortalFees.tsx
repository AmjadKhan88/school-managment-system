import { useQuery } from "@tanstack/react-query";
import { Printer, X } from "lucide-react";
import { useState } from "react";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { ChildGate, Empty, Spinner } from "./ChildGate";
import { fmtMoney, METHOD, period, PortalChild } from "./shared";

interface Invoice {
  id: string;
  invoiceNo: string;
  periodKey: string;
  issueDate: string;
  dueDate: string;
  status: string;
  subtotal: string;
  discount: string;
  fine: string;
  total: string;
  paid: string;
  balance: string;
  overdue: boolean;
  items: { description: string; amount: string; discount: string }[];
}
interface Payment {
  id: string;
  receiptNo: string;
  paymentDate: string;
  status: string;
  total: string;
  advance: string;
  methods: { method: string; amount: string }[];
  allocations: { invoiceNo: string; periodKey: string; amount: string }[];
}
interface Data {
  totalDue: string;
  credit: string;
  invoices: Invoice[];
  payments: Payment[];
}

const STATUS: Record<string, [string, string]> = {
  OPEN: ["Unpaid", "bg-sky-100 text-sky-700"],
  PARTIAL: ["Part paid", "bg-amber-100 text-amber-700"],
  PAID: ["Paid", "bg-emerald-100 text-emerald-700"],
};

export default function PortalFees() {
  return (
    <ChildGate title="Fees" subtitle="vouchers and payments">
      {(c) => <Body child={c} />}
    </ChildGate>
  );
}

function Body({ child }: { child: PortalChild }) {
  const [tab, setTab] = useState<"vouchers" | "payments">("vouchers");
  const [voucher, setVoucher] = useState<Invoice | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const q = useQuery({
    queryKey: ["portal", "fees", child.id],
    queryFn: async () =>
      (
        await api.get<{ data: Data }>("/portal/fees", {
          params: { studentId: child.id },
        })
      ).data.data,
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError)
    return (
      <div className="card p-6 text-center text-sm text-rose-600">
        {apiMessage(q.error, "Could not load")}
      </div>
    );
  const d = q.data!;
  const due = Number(d.totalDue);

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">Total due now</p>
          <p className={cn("mt-0.5 text-3xl font-extrabold", due > 0 ? "text-rose-600" : "text-emerald-600")}>
            {fmtMoney(d.totalDue)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Includes late fines up to today. Fees are paid at the school office.
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">Advance credit</p>
          <p className="mt-0.5 text-3xl font-extrabold text-ink-950">{fmtMoney(d.credit)}</p>
          <p className="mt-1 text-xs text-slate-500">Paid ahead and not yet applied to a voucher.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {(["vouchers", "payments"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold capitalize",
              tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {k === "vouchers" ? "Fee vouchers" : "Payment receipts"}
          </button>
        ))}
      </div>

      {tab === "vouchers" &&
        (d.invoices.length === 0 ? (
          <Empty>No fee vouchers have been issued yet.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  {["Month", "Voucher", "Due date", "Total", "Paid", "Balance", "Status"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.invoices.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold">{period(i.periodKey)}</td>
                    <td className="px-4 py-3">{i.invoiceNo}</td>
                    <td className={cn("whitespace-nowrap px-4 py-3", i.overdue && "font-semibold text-rose-600")}>
                      {fmtDate(i.dueDate)}
                    </td>
                    <td className="px-4 py-3">{fmtMoney(i.total)}</td>
                    <td className="px-4 py-3">{fmtMoney(i.paid)}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMoney(i.balance)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[i.status]?.[1])}>
                        {STATUS[i.status]?.[0] ?? i.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setVoucher(i)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "payments" &&
        (d.payments.length === 0 ? (
          <Empty>No payments have been received yet.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  {["Receipt", "Date", "Method", "Amount", "Status"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold">{p.receiptNo}</td>
                    <td className="whitespace-nowrap px-4 py-3">{fmtDate(p.paymentDate)}</td>
                    <td className="px-4 py-3">{p.methods.map((m) => METHOD[m.method] ?? m.method).join(", ")}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMoney(p.total)}</td>
                    <td className="px-4 py-3">
                      {p.status === "REVERSED" ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Reversed</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Received</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setReceipt(p)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {voucher && (
        <Sheet id="voucher" title="Fee voucher" onClose={() => setVoucher(null)}>
          <Header child={child} />
          <p className="mt-3 text-sm">
            <strong>{voucher.invoiceNo}</strong> · {period(voucher.periodKey)} · due {fmtDate(voucher.dueDate)}
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {voucher.items.map((it, n) => (
                <tr key={n} className="border-b border-line">
                  <td className="py-1.5">{it.description}</td>
                  <td className="py-1.5 text-right">{fmtMoney(it.amount)}</td>
                </tr>
              ))}
              {Number(voucher.discount) > 0 && (
                <tr><td className="py-1.5">Discount</td><td className="py-1.5 text-right">− {fmtMoney(voucher.discount)}</td></tr>
              )}
              {Number(voucher.fine) > 0 && (
                <tr><td className="py-1.5">Late fine</td><td className="py-1.5 text-right">{fmtMoney(voucher.fine)}</td></tr>
              )}
              <tr className="font-bold"><td className="pt-2">Total</td><td className="pt-2 text-right">{fmtMoney(voucher.total)}</td></tr>
              <tr><td className="py-1">Paid</td><td className="py-1 text-right">{fmtMoney(voucher.paid)}</td></tr>
              <tr className="font-bold"><td>Balance</td><td className="text-right">{fmtMoney(voucher.balance)}</td></tr>
            </tbody>
          </table>
        </Sheet>
      )}

      {receipt && (
        <Sheet id="receipt" title="Payment receipt" onClose={() => setReceipt(null)}>
          <Header child={child} />
          <p className="mt-3 text-sm">
            <strong>{receipt.receiptNo}</strong> · {fmtDate(receipt.paymentDate)}
            {receipt.status === "REVERSED" && <span className="ml-2 font-bold text-rose-600">REVERSED</span>}
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {receipt.allocations.map((a, n) => (
                <tr key={n} className="border-b border-line">
                  <td className="py-1.5">{period(a.periodKey)} ({a.invoiceNo})</td>
                  <td className="py-1.5 text-right">{fmtMoney(a.amount)}</td>
                </tr>
              ))}
              {Number(receipt.advance) > 0 && (
                <tr><td className="py-1.5">Kept as advance credit</td><td className="py-1.5 text-right">{fmtMoney(receipt.advance)}</td></tr>
              )}
              <tr className="font-bold"><td className="pt-2">Amount received</td><td className="pt-2 text-right">{fmtMoney(receipt.total)}</td></tr>
              {receipt.methods.map((m, n) => (
                <tr key={n} className="text-slate-600"><td className="py-0.5">Paid by {METHOD[m.method] ?? m.method}</td><td className="py-0.5 text-right">{fmtMoney(m.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}
    </>
  );
}

function Header({ child }: { child: PortalChild }) {
  const school = useAuth((s) => s.user?.school.name);
  return (
    <div className="border-b-2 border-slate-800 pb-2">
      <p className="text-lg font-extrabold uppercase">{school}</p>
      <p className="text-sm">
        {child.fullName} · {child.admissionNo}
        {child.enrollment ? ` · ${child.enrollment.className} ${child.enrollment.sectionName}` : ""}
      </p>
    </div>
  );
}

/** A dialog whose content prints alone, using the voucher and receipt print rules already in the stylesheet. */
function Sheet({ id, title, onClose, children }: { id: "voucher" | "receipt"; title: string; onClose: () => void; children: React.ReactNode }) {
  const print = () => {
    document.body.classList.add("print-voucher");
    window.print();
    setTimeout(() => document.body.classList.remove("print-voucher"), 500);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center" role="dialog" aria-modal="true">
      <div className="card w-full max-w-md p-6">
        <div className="mb-3 flex items-center justify-between print:hidden">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="flex items-center gap-1">
            <button className="btn border border-slate-300 py-1.5" onClick={print}><Printer size={15} />Print</button>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>
        <div id={id}>{children}</div>
      </div>
    </div>
  );
}

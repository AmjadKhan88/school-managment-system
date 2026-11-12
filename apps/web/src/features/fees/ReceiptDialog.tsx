import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer, Undo2, X } from "lucide-react";
import toast from "react-hot-toast";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { fmtMoney, METHOD_LABEL, Method } from "./shared";

interface Receipt {
  id: string;
  receiptNo: string;
  kind: "PAYMENT" | "REVERSAL";
  status: "POSTED" | "REVERSED";
  paymentDate: string;
  totalAmount: string;
  unallocatedAmount: string;
  duesBefore: string;
  duesAfter: string;
  notes: string | null;
  reversalReason: string | null;
  reversedAt: string | null;
  reversesReceiptNo: string | null;
  receivedBy: string | null;
  student: {
    admissionNo: string;
    fullName: string;
    fatherName: string;
    className: string | null;
    section: string | null;
  };
  lines: { method: Method; amount: string; reference: string | null }[];
  allocations: { amount: string; invoiceNo: string; periodKey: string }[];
}

const monthLabel = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export function ReceiptDialog({
  id,
  onClose,
  reprint = false,
}: {
  id: string;
  onClose: () => void;
  reprint?: boolean;
}) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const school = useAuth((s) => s.user?.school.name);

  const q = useQuery({
    queryKey: ["fees", "receipt", id],
    queryFn: async () =>
      (await api.get<{ data: Receipt }>(`/fees/payments/${id}`)).data.data,
  });
  const r = q.data;

  const reverse = useMutation({
    mutationFn: (reason: string) =>
      api.post<{ data: { reversalReceiptNo: string } }>(
        `/fees/payments/${id}/reverse`,
        { reason },
      ),
    onSuccess: (res) => {
      toast.success(
        `Payment reversed. Entry ${res.data.data.reversalReceiptNo}`,
      );
      qc.invalidateQueries({ queryKey: ["fees"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const askReverse = () => {
    const reason = window.prompt(
      "Reason for reversing this payment. Invoice balances will be restored and a reversal entry recorded:",
    );
    if (reason && reason.trim().length >= 3) reverse.mutate(reason.trim());
    else if (reason !== null)
      toast.error("Please give a reason of at least 3 characters");
  };

  const print = () => {
    document.body.classList.add("print-voucher");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("print-voucher"),
      { once: true },
    );
    window.print();
  };

  const isReversal = r?.kind === "REVERSAL";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-6">
        <div className="no-print flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {isReversal ? "Reversal entry" : "Fee receipt"}
          </h2>
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
            {apiMessage(q.error, "Could not load the receipt")}
          </p>
        )}

        {r && (
          <>
            <div id="receipt" className="mt-3">
              <div className="text-center">
                <p className="text-lg font-extrabold text-ink-950">{school}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {isReversal ? "Payment reversal" : "Fee receipt"}
                  {reprint && !isReversal ? " (copy)" : ""}
                </p>
              </div>
              <div className="mt-3 flex items-start justify-between text-sm">
                <div>
                  <p className="text-xs text-slate-500">Receipt no</p>
                  <p className="text-base font-extrabold">{r.receiptNo}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Date</p>
                  <p className="font-semibold">{fmtDate(r.paymentDate)}</p>
                </div>
              </div>
              {r.status === "REVERSED" && (
                <p className="mt-2 rounded-lg bg-rose-50 p-2 text-center text-sm font-bold text-rose-700">
                  REVERSED{r.reversalReason ? `: ${r.reversalReason}` : ""}
                </p>
              )}
              {isReversal && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-800">
                  Reverses receipt {r.reversesReceiptNo}. Reason:{" "}
                  {r.reversalReason}
                </p>
              )}

              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-bold">{r.student.fullName}</p>
                <p className="text-slate-600">
                  {r.student.admissionNo}
                  {r.student.className
                    ? ` · ${r.student.className} / ${r.student.section}`
                    : ""}{" "}
                  · Father: {r.student.fatherName}
                </p>
              </div>

              {r.allocations.length > 0 && (
                <table className="mt-4 w-full text-sm">
                  <thead className="text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="py-2">Fee month</th>
                      <th className="py-2">Invoice</th>
                      <th className="py-2 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.allocations.map((a, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-2">{monthLabel(a.periodKey)}</td>
                        <td className="py-2">{a.invoiceNo}</td>
                        <td className="py-2 text-right">
                          {fmtMoney(a.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="mt-3 border-t border-line pt-3 text-sm">
                {r.lines.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-slate-600">
                      {METHOD_LABEL[l.method]}
                      {l.reference ? ` (${l.reference})` : ""}
                    </span>
                    <span>{fmtMoney(l.amount)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-extrabold">
                  <span>
                    {isReversal ? "Amount reversed" : "Amount received"}
                  </span>
                  <span>{fmtMoney(r.totalAmount)}</span>
                </div>
                {!isReversal && (
                  <div className="mt-2 space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>Dues before this payment</span>
                      <span>{fmtMoney(r.duesBefore)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Remaining dues</span>
                      <span className="font-semibold text-ink-950">
                        {fmtMoney(r.duesAfter)}
                      </span>
                    </div>
                    {Number(r.unallocatedAmount) > 0 && (
                      <div className="flex justify-between">
                        <span>Advance credit held</span>
                        <span>{fmtMoney(r.unallocatedAmount)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {r.notes && (
                <p className="mt-3 text-xs text-slate-500">Note: {r.notes}</p>
              )}
              <p className="mt-4 text-xs text-slate-500">
                Received by: {r.receivedBy ?? "—"}
              </p>
              <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
                <div className="border-t border-slate-300 pt-1">
                  Parent / guardian
                </div>
                <div className="border-t border-slate-300 pt-1">
                  Accounts officer
                </div>
              </div>
            </div>

            <div className="no-print mt-5 flex flex-wrap justify-end gap-2">
              {can("fee_collection", "APPROVE") &&
                r.kind === "PAYMENT" &&
                r.status === "POSTED" && (
                  <button
                    className="btn border border-rose-300 text-rose-600"
                    onClick={askReverse}
                    disabled={reverse.isPending}
                  >
                    {reverse.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Undo2 size={16} />
                    )}
                    Reverse payment
                  </button>
                )}
              {can("fee_collection", "VIEW") && (
                <button className="btn-primary" onClick={print}>
                  <Printer size={16} />
                  Print receipt
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

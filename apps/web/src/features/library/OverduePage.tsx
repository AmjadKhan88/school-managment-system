import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, Printer } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { IssueItem, money, waLink } from "./shared";

interface Row extends IssueItem {
  phone: string | null;
  contactName: string | null;
}

export default function OverduePage() {
  const [type, setType] = useState("");
  const q = useQuery({
    queryKey: ["library", "overdue"],
    queryFn: async () =>
      (await api.get<{ data: Row[] }>("/library/overdue")).data.data,
  });
  const rows = (q.data ?? []).filter((r) => !type || r.borrowerType === type);
  const total = rows.reduce((t, r) => t + Number(r.fineSoFar ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Overdue Books"
        subtitle="Books past their due date, with the fine so far. The fine is charged when the book comes back."
        actions={
          <div className="no-print flex gap-2">
            <select
              className="input w-40"
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Borrower type"
            >
              <option value="">Students and staff</option>
              <option value="STUDENT">Students</option>
              <option value="EMPLOYEE">Staff</option>
            </select>
            <button
              className="btn border border-slate-300"
              onClick={() => window.print()}
              disabled={rows.length === 0}
            >
              <Printer size={16} />
              Print
            </button>
          </div>
        }
      />
      {q.data && (
        <p className="mb-3 text-sm font-semibold">
          {rows.length} overdue book{rows.length === 1 ? "" : "s"} · fines so
          far {money(total)}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {["Book", "Borrower", "Was due", "Days late"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Fine so far</th>
              <th className="no-print px-4 py-3">Remind</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {q.isError && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(q.error, "Could not load overdue books")}
                </td>
              </tr>
            )}
            {q.data && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No overdue books.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const link = waLink(
                r.phone,
                `Dear ${r.contactName ?? r.borrower.name}, the library book "${r.book.title}" (${r.accessionNo}) borrowed by ${r.borrower.name} was due on ${fmtDate(r.dueDate)}. Please return it to the school library. Thank you.`,
              );
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    {r.book.title}
                    <span className="block text-xs text-slate-500">
                      {r.accessionNo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.borrower.name}
                    <span className="block text-xs text-slate-500">
                      {r.borrower.detail} ·{" "}
                      {r.borrowerType === "STUDENT" ? "student" : "staff"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {fmtDate(r.dueDate)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-semibold",
                      r.daysLate > 14 ? "text-rose-600" : "text-amber-600",
                    )}
                  >
                    {r.daysLate}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {money(r.fineSoFar)}
                  </td>
                  <td className="no-print px-4 py-2">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">No phone</span>
                    )}
                    {r.contactName && r.borrowerType === "STUDENT" && (
                      <span className="block text-[11px] text-slate-400">
                        {r.contactName}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { useQuery } from "@tanstack/react-query";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChildGate, Empty, Spinner } from "./ChildGate";
import { fmtMoney } from "./shared";

interface Loan {
  id: string;
  status: string;
  issuedOn: string;
  dueDate: string;
  returnedOn: string | null;
  book: { title: string; author: string };
  accessionNo: string;
  daysLate: number;
  fineSoFar: string | null;
}
interface Data {
  limits: { max: number; loanDays: number };
  open: Loan[];
  history: Loan[];
  unpaid: { total: string; items: { id: string; fineNo: string; reason: string; amount: string }[] };
}

export default function PortalLibrary() {
  return (
    <ChildGate title="Library" subtitle="books borrowed">
      {(c) => <Body studentId={c.id} />}
    </ChildGate>
  );
}

function Body({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["portal", "library", studentId],
    queryFn: async () =>
      (await api.get<{ data: Data }>("/portal/library", { params: { studentId } })).data.data,
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <div className="card p-6 text-center text-sm text-rose-600">{apiMessage(q.error, "Could not load")}</div>;
  const d = q.data!;
  return (
    <div className="space-y-5">
      {Number(d.unpaid.total) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Unpaid library fines: {fmtMoney(d.unpaid.total)}</p>
          <p className="text-xs">Please pay at the library or school office. New books cannot be issued until fines are cleared.</p>
        </div>
      )}
      <section>
        <h2 className="mb-2 text-base font-bold text-ink-950">Books out now ({d.open.length} of {d.limits.max})</h2>
        {d.open.length === 0 ? <Empty>No books are out.</Empty> : (
          <div className="grid gap-3">
            {d.open.map((l) => (
              <div key={l.id} className="card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold text-ink-950">{l.book.title}</p>
                  <p className="text-xs text-slate-500">{l.book.author} · {l.accessionNo} · issued {fmtDate(l.issuedOn)}</p>
                </div>
                <div className="text-right text-sm">
                  <p className={cn("font-semibold", l.daysLate > 0 && "text-rose-600")}>Due {fmtDate(l.dueDate)}</p>
                  {l.daysLate > 0 && <p className="text-xs text-rose-600">{l.daysLate} day{l.daysLate === 1 ? "" : "s"} late · fine so far {fmtMoney(l.fineSoFar)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-base font-bold text-ink-950">History</h2>
        {d.history.length === 0 ? <Empty>No earlier loans.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>{["Book", "Issued", "Returned", "Note"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {d.history.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{l.book.title}</td>
                    <td className="whitespace-nowrap px-4 py-3">{fmtDate(l.issuedOn)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{l.returnedOn ? fmtDate(l.returnedOn) : "—"}</td>
                    <td className="px-4 py-3 text-xs">{l.status === "LOST" ? "Lost" : l.daysLate > 0 ? `${l.daysLate} days late` : "On time"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

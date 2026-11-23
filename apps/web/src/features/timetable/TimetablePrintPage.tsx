import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2, Printer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Period } from "./shared";

interface Cell {
  dayOfWeek: number;
  periodId: string;
  title: string;
  subtitle: string;
  room: string | null;
}
interface PrintData {
  school: {
    name: string;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
  };
  session: string;
  periods: Period[];
  days: { day: number; name: string }[];
  grids: { title: string; subtitle: string | null; cells: Cell[] }[];
}

export default function TimetablePrintPage() {
  const [p] = useSearchParams();
  const params = Object.fromEntries([...p.entries()]);
  const q = useQuery({
    queryKey: ["timetable", "print", params],
    enabled: !!params.sessionId && !!params.type,
    queryFn: async () =>
      (await api.get<{ data: PrintData }>("/timetable/print", { params })).data
        .data,
  });
  const d = q.data;

  if (!params.sessionId || !params.type)
    return (
      <p className="p-8 text-center text-sm text-slate-600">
        This link is missing details.
      </p>
    );
  if (q.isLoading)
    return <Loader2 className="mx-auto mt-20 animate-spin text-slate-400" />;
  if (q.isError)
    return (
      <p className="p-8 text-center text-sm text-rose-600">
        {apiMessage(q.error, "Could not load the timetable")}
      </p>
    );
  if (!d) return null;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          <strong>{d.grids.length}</strong> timetable
          {d.grids.length === 1 ? "" : "s"}. Choose <strong>Save as PDF</strong>{" "}
          as the printer to get a PDF file.
        </p>
        <button
          className="btn-primary"
          onClick={() => window.print()}
          disabled={d.grids.length === 0}
        >
          <Printer size={16} />
          Print / Save as PDF
        </button>
      </div>
      <div className="space-y-6 p-4 print:space-y-0 print:p-0">
        {d.grids.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            Nothing to print.
          </p>
        )}
        {d.grids.map((g, i) => (
          <article
            key={i}
            className={cn(
              "mx-auto w-full max-w-[297mm] border border-slate-300 bg-white p-6 text-[12.5px] print:max-w-none print:border-0 print:p-0 break-after-page last:break-after-auto",
            )}
          >
            <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-300 bg-slate-50">
                {d.school.logoUrl ? (
                  <img
                    src={d.school.logoUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <GraduationCap size={26} className="text-slate-500" />
                )}
              </div>
              <div className="flex-1 text-center">
                <p className="text-lg font-extrabold uppercase tracking-wide">
                  {d.school.name}
                </p>
                {d.school.address && (
                  <p className="text-xs text-slate-600">{d.school.address}</p>
                )}
              </div>
              <div className="w-12 shrink-0" />
            </div>
            <div className="mt-3 text-center">
              <p className="text-base font-bold uppercase tracking-widest">
                Timetable
              </p>
              <p className="text-sm font-semibold">{g.title}</p>
              <p className="text-xs text-slate-600">
                Session {d.session}
                {g.subtitle ? ` · ${g.subtitle}` : ""}
              </p>
            </div>
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="bg-slate-800 text-left text-white">
                  <th className="w-28 px-2 py-1.5 font-semibold">Period</th>
                  {d.days.map((x) => (
                    <th
                      key={x.day}
                      className="border-l border-slate-600 px-2 py-1.5 font-semibold"
                    >
                      {x.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.periods.map((per) => (
                  <tr key={per.id} className={per.isBreak ? "bg-amber-50" : ""}>
                    <td className="border-b border-slate-300 px-2 py-1.5 align-top">
                      <span className="font-semibold">{per.name}</span>
                      <span className="block text-[10px] text-slate-500">
                        {per.startTime} to {per.endTime}
                      </span>
                    </td>
                    {per.isBreak ? (
                      <td
                        colSpan={d.days.length}
                        className="border-b border-l border-slate-300 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-amber-700"
                      >
                        Break
                      </td>
                    ) : (
                      d.days.map((x) => {
                        const c = g.cells.find(
                          (y) => y.dayOfWeek === x.day && y.periodId === per.id,
                        );
                        return (
                          <td
                            key={x.day}
                            className="border-b border-l border-slate-300 px-2 py-1.5 align-top"
                          >
                            {c && (
                              <>
                                <p className="font-semibold">{c.title}</p>
                                <p className="text-[11px] text-slate-600">
                                  {c.subtitle}
                                </p>
                                {c.room && (
                                  <p className="text-[10px] text-slate-400">
                                    Room {c.room}
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-center text-[10px] text-slate-400">
              Printed {new Date().toLocaleDateString()}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

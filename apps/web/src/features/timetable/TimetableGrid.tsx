import { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/features/students/shared";
import { DAY_NAMES, Period } from "./shared";

export interface GridDay {
  day: number;
  date?: string;
  flag?: ReactNode;
}

/** Periods down the side, working days across the top. Breaks span the whole row. */
export function TimetableGrid({
  days,
  periods,
  cell,
  onCell,
  compact,
}: {
  days: GridDay[];
  periods: Period[];
  cell: (day: number, p: Period) => ReactNode;
  onCell?: (day: number, p: Period) => void;
  compact?: boolean;
}) {
  return (
    <div className="card overflow-x-auto print:border-0 print:shadow-none">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <th className="w-32 border-b border-line px-3 py-3">Period</th>
            {days.map((d) => (
              <th
                key={d.day}
                className="border-b border-l border-line px-3 py-3"
              >
                {DAY_NAMES[d.day - 1]}
                {d.date && (
                  <span className="block text-[11px] font-normal text-slate-400">
                    {fmtDate(d.date)}
                  </span>
                )}
                {d.flag}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className={p.isBreak ? "bg-amber-50/60" : ""}>
              <td className="border-b border-line px-3 py-2.5 align-top">
                <span className="font-semibold">{p.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {p.startTime} to {p.endTime}
                </span>
              </td>
              {p.isBreak ? (
                <td
                  colSpan={days.length}
                  className="border-b border-l border-line px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-amber-700"
                >
                  Break
                </td>
              ) : (
                days.map((d) => (
                  <td
                    key={d.day}
                    onClick={onCell ? () => onCell(d.day, p) : undefined}
                    className={cn(
                      "border-b border-l border-line align-top",
                      compact ? "px-2 py-1.5" : "px-3 py-2.5",
                      onCell && "cursor-pointer hover:bg-brand-50/50",
                    )}
                  >
                    {cell(d.day, p)}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

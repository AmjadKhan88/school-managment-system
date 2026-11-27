import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChildGate, Empty, Spinner } from "./ChildGate";
import { ATT_STYLE } from "./shared";

interface Summary {
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  recorded: number;
  percent: number | null;
}
interface Data {
  month: string;
  records: { date: string; status: string; remarks: string | null }[];
  monthSummary: Summary;
  sessionSummary: Summary;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const shift = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
};

export default function PortalAttendance() {
  return (
    <ChildGate title="Attendance">
      {(c) => <Body studentId={c.id} />}
    </ChildGate>
  );
}

function Stats({ title, s }: { title: string; s: Summary }) {
  const items: [string, number][] = [
    ["Present", s.present],
    ["Absent", s.absent],
    ["Late", s.late],
    ["Leave", s.leave],
    ["Half day", s.halfDay],
  ];
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-ink-950">{title}</h3>
        <span className="text-2xl font-extrabold text-ink-950">
          {s.percent === null ? "—" : `${s.percent}%`}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-5 gap-2 text-center">
        {items.map(([l, v]) => (
          <div key={l} className="rounded-lg bg-slate-50 py-2">
            <dd className="text-lg font-bold">{v}</dd>
            <dt className="text-[11px] text-slate-500">{l}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {s.recorded} day{s.recorded === 1 ? "" : "s"} recorded. Leave days are not counted against attendance.
      </p>
    </div>
  );
}

function Body({ studentId }: { studentId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const q = useQuery({
    queryKey: ["portal", "attendance", studentId, month],
    queryFn: async () =>
      (
        await api.get<{ data: Data }>("/portal/attendance", {
          params: { studentId, month },
        })
      ).data.data,
  });
  const d = q.data;
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); // 0 = Sunday
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const byDay = new Map(d?.records.map((r) => [Number(r.date.slice(8)), r]));
  const cells = [
    ...Array.from({ length: (first + 6) % 7 }, () => 0), // week starts Monday
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-4">
      {d && (
        <div className="grid gap-4 md:grid-cols-2">
          <Stats title="This month" s={d.monthSummary} />
          <Stats title="This session" s={d.sessionSummary} />
        </div>
      )}
      <div className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <button
            className="rounded-md p-2 hover:bg-slate-100"
            aria-label="Previous month"
            onClick={() => setMonth(shift(month, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-bold text-ink-950">
            {new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h3>
          <button
            className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Next month"
            disabled={month >= thisMonth()}
            onClick={() => setMonth(shift(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {q.isLoading && <Spinner />}
        {q.isError && (
          <p className="text-center text-sm text-rose-600">
            {apiMessage(q.error, "Could not load")}
          </p>
        )}
        {d && (
          <>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {cells.map((n, i) => {
                const r = n ? byDay.get(n) : undefined;
                return (
                  <div
                    key={i}
                    title={r ? `${ATT_STYLE[r.status][0]}${r.remarks ? `: ${r.remarks}` : ""}` : undefined}
                    className={cn(
                      "grid aspect-square place-items-center rounded-lg text-sm",
                      n === 0 && "invisible",
                      r ? ATT_STYLE[r.status][1] + " font-bold" : "bg-slate-50 text-slate-400",
                    )}
                  >
                    {n || ""}
                  </div>
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {Object.entries(ATT_STYLE).map(([k, [l, c]]) => (
                <li key={k} className={cn("rounded-full px-2.5 py-0.5 font-semibold", c)}>
                  {l}
                </li>
              ))}
            </ul>
            {d.records.length === 0 && (
              <div className="mt-4">
                <Empty>No attendance was recorded this month.</Empty>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

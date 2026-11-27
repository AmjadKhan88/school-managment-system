import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TimetableGrid } from "@/features/timetable/TimetableGrid";
import type { Period } from "@/features/timetable/shared";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChildGate, Empty, Spinner } from "./ChildGate";

interface Tt {
  workingDays: number[];
  periods: Period[];
  entries: { dayOfWeek: number; periodId: string; subject: string; teacher: string | null; room: string | null }[];
}
interface Paper {
  id: string;
  examName: string;
  provisional: boolean;
  subject: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  totalMarks: number;
}

export default function PortalTimetable() {
  const [tab, setTab] = useState<"class" | "exams">("class");
  return (
    <ChildGate title="Timetable" subtitle="classes and exam dates">
      {(c) => (
        <>
          <div className="mb-4 flex gap-1 border-b border-line">
            {([["class", "Class timetable"], ["exams", "Exam schedule"]] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold", tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}
              >
                {l}
              </button>
            ))}
          </div>
          {tab === "class" ? <Class studentId={c.id} /> : <Exams studentId={c.id} />}
        </>
      )}
    </ChildGate>
  );
}

function Class({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["portal", "timetable", studentId],
    queryFn: async () =>
      (await api.get<{ data: Tt }>("/portal/timetable", { params: { studentId } })).data.data,
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError)
    return <div className="card p-6 text-center text-sm text-rose-600">{apiMessage(q.error, "Could not load")}</div>;
  const d = q.data!;
  if (d.periods.length === 0 || d.entries.length === 0)
    return <Empty>The timetable has not been set up for this class yet.</Empty>;
  const at = new Map(d.entries.map((e) => [`${e.dayOfWeek}:${e.periodId}`, e]));
  return (
    <TimetableGrid
      days={d.workingDays.map((day) => ({ day }))}
      periods={d.periods}
      cell={(day, p) => {
        const e = at.get(`${day}:${p.id}`);
        return e ? (
          <div>
            <p className="font-semibold text-ink-950">{e.subject}</p>
            <p className="text-[11px] text-slate-500">{[e.teacher, e.room].filter(Boolean).join(" · ")}</p>
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        );
      }}
    />
  );
}

function Exams({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["portal", "exam-schedule", studentId],
    queryFn: async () =>
      (await api.get<{ data: Paper[] }>("/portal/exam-schedule", { params: { studentId } })).data.data,
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError)
    return <div className="card p-6 text-center text-sm text-rose-600">{apiMessage(q.error, "Could not load")}</div>;
  if (!q.data?.length) return <Empty>No upcoming exam papers are scheduled.</Empty>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>{["Date", "Time", "Subject", "Exam", "Room", "Marks"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody>
          {q.data.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-4 py-3 font-semibold">{fmtDate(p.date)}</td>
              <td className="whitespace-nowrap px-4 py-3">{p.startTime ? `${p.startTime}${p.endTime ? ` to ${p.endTime}` : ""}` : "—"}</td>
              <td className="px-4 py-3 font-semibold">{p.subject}</td>
              <td className="px-4 py-3">{p.examName}{p.provisional && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Provisional</span>}</td>
              <td className="px-4 py-3">{p.room ?? "—"}</td>
              <td className="px-4 py-3">{p.totalMarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

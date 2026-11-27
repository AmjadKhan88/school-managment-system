import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  NotebookPen,
  Trophy,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChildGate, Spinner } from "./ChildGate";
import { ATT_STYLE, fmtMoney } from "./shared";

interface Overview {
  attendance: {
    today: string | null;
    percent: number | null;
    recorded: number;
    absent: number;
    late: number;
  };
  fees: { totalDue: string; credit: string };
  library: { out: number; overdue: number; unpaidFines: string };
  homeworkDue: number;
  pendingLeaves: number;
  latestResult: null | {
    examId: string;
    examName: string;
    percentage: number | null;
    grade: string | null;
    position: number | null;
    result: string;
  };
  nextPaper: null | {
    examName: string;
    subject: string;
    date: string;
    startTime: string | null;
    room: string | null;
  };
}

function Tile({
  to,
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-ink-950",
  tile = "bg-brand-50 text-brand-600",
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  tile?: string;
}) {
  return (
    <Link
      to={to}
      className="card flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tile)}>
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className={cn("mt-0.5 truncate text-2xl font-extrabold leading-tight", tone)}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </Link>
  );
}

export default function PortalHome() {
  return (
    <ChildGate title="Welcome" subtitle="this session at a glance">
      {(child) => <Body studentId={child.id} />}
    </ChildGate>
  );
}

function Body({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["portal", "overview", studentId],
    queryFn: async () =>
      (
        await api.get<{ data: Overview }>("/portal/overview", {
          params: { studentId },
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
  const today = d.attendance.today ? ATT_STYLE[d.attendance.today] : null;
  const due = Number(d.fees.totalDue);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Tile
        to="/portal/attendance"
        icon={CalendarCheck}
        label="Attendance this session"
        value={d.attendance.percent === null ? "No records" : `${d.attendance.percent}%`}
        hint={today ? `Today: ${today[0]}` : `${d.attendance.absent} absent · ${d.attendance.late} late`}
        tone={d.attendance.percent !== null && d.attendance.percent < 75 ? "text-rose-600" : "text-ink-950"}
        tile="bg-indigo-50 text-indigo-600"
      />
      <Tile
        to="/portal/fees"
        icon={Wallet}
        label="Fees due"
        value={fmtMoney(d.fees.totalDue)}
        hint={Number(d.fees.credit) > 0 ? `Advance credit ${fmtMoney(d.fees.credit)}` : due > 0 ? "Please clear dues at the school office" : "Nothing outstanding"}
        tone={due > 0 ? "text-rose-600" : "text-emerald-600"}
        tile="bg-amber-50 text-amber-600"
      />
      <Tile
        to="/portal/homework"
        icon={NotebookPen}
        label="Homework to hand in"
        value={String(d.homeworkDue)}
        hint="Not yet submitted and not past due"
        tile="bg-sky-50 text-sky-600"
      />
      <Tile
        to="/portal/results"
        icon={Trophy}
        label="Latest result"
        value={d.latestResult ? (d.latestResult.percentage === null ? d.latestResult.result : `${d.latestResult.percentage}%`) : "None yet"}
        hint={d.latestResult ? `${d.latestResult.examName}${d.latestResult.grade ? ` · Grade ${d.latestResult.grade}` : ""}` : "Published results appear here"}
        tile="bg-emerald-50 text-emerald-600"
      />
      <Tile
        to="/portal/timetable"
        icon={CalendarClock}
        label="Next paper"
        value={d.nextPaper ? d.nextPaper.subject : "None scheduled"}
        hint={d.nextPaper ? `${d.nextPaper.examName} · ${fmtDate(d.nextPaper.date)}${d.nextPaper.startTime ? ` ${d.nextPaper.startTime}` : ""}` : undefined}
        tile="bg-violet-50 text-violet-600"
      />
      <Tile
        to="/portal/library"
        icon={BookOpen}
        label="Library"
        value={`${d.library.out} book${d.library.out === 1 ? "" : "s"} out`}
        hint={d.library.overdue > 0 ? `${d.library.overdue} overdue` : Number(d.library.unpaidFines) > 0 ? `Unpaid fines ${fmtMoney(d.library.unpaidFines)}` : "All in order"}
        tone={d.library.overdue > 0 ? "text-rose-600" : "text-ink-950"}
        tile="bg-teal-50 text-teal-600"
      />
      {d.pendingLeaves > 0 && (
        <Tile
          to="/portal/leaves"
          icon={CalendarOff}
          label="Leave awaiting a decision"
          value={String(d.pendingLeaves)}
          tile="bg-rose-50 text-rose-600"
        />
      )}
    </div>
  );
}

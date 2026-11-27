import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CardsData, ReportCardView } from "@/features/exams/ReportCardView";
import { EXAM_TYPE_LABEL } from "@/features/exams/shared";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChildGate, Empty, Spinner } from "./ChildGate";

interface Row {
  examId: string;
  examName: string;
  examType: string;
  session: string;
  startDate: string;
  endDate: string;
  obtained: number;
  max: number;
  percentage: number | null;
  grade: string | null;
  gpa: number | null;
  result: "PASS" | "FAIL";
  position: number | null;
}

export default function PortalResults() {
  return (
    <ChildGate title="Results" subtitle="published exam results">
      {(c) => <List studentId={c.id} />}
    </ChildGate>
  );
}

function List({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["portal", "results", studentId],
    queryFn: async () =>
      (
        await api.get<{ data: Row[] }>("/portal/results", {
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
  if (!q.data?.length) return <Empty>No results have been published yet.</Empty>;
  return (
    <div className="grid gap-3">
      {q.data.map((r) => (
        <div key={r.examId} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-bold text-ink-950">{r.examName}</p>
            <p className="text-xs text-slate-500">
              {EXAM_TYPE_LABEL[r.examType] ?? r.examType} · {r.session} · {fmtDate(r.startDate)} to {fmtDate(r.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <div className="text-center">
              <p className="text-lg font-extrabold">{r.obtained}/{r.max}</p>
              <p className="text-[11px] text-slate-500">{r.percentage === null ? "—" : `${r.percentage}%`}{r.grade ? ` · ${r.grade}` : ""}</p>
            </div>
            {r.position && <div className="text-center"><p className="text-lg font-extrabold">#{r.position}</p><p className="text-[11px] text-slate-500">Position</p></div>}
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold", r.result === "PASS" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
              {r.result}
            </span>
            <Link to={`/portal/report-card/${r.examId}`} className="btn-primary py-1.5">Report card</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PortalReportCard() {
  const { examId = "" } = useParams();
  return (
    <ChildGate title="Report card">
      {(c) => <Card studentId={c.id} examId={examId} />}
    </ChildGate>
  );
}

function Card({ studentId, examId }: { studentId: string; examId: string }) {
  const q = useQuery({
    queryKey: ["portal", "report-card", studentId, examId],
    queryFn: async () =>
      (
        await api.get<{ data: CardsData }>("/portal/report-card", {
          params: { studentId, examId },
        })
      ).data.data,
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data?.cards[0])
    return (
      <div className="card p-6 text-center text-sm text-rose-600">
        {apiMessage(q.error, "This report card is not available")}
        <div className="mt-3"><Link to="/portal/results" className="btn-primary">Back to results</Link></div>
      </div>
    );
  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/portal/results" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={15} />All results</Link>
        <button className="btn-primary" onClick={() => window.print()}><Printer size={16} />Print / Save as PDF</button>
      </div>
      <ReportCardView data={q.data} card={q.data.cards[0]} />
    </>
  );
}

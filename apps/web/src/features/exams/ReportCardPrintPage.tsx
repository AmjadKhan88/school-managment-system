import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, apiMessage } from "@/lib/api";
import { CardsData, ReportCardView } from "./ReportCardView";

export default function ReportCardPrintPage() {
  const [p] = useSearchParams();
  const examId = p.get("examId") ?? "";
  const classId = p.get("classId") ?? "";
  const studentId = p.get("studentId") ?? undefined;
  const sectionId = p.get("sectionId") ?? undefined;

  const q = useQuery({
    queryKey: ["report-cards", "print", examId, classId, studentId, sectionId],
    enabled: !!examId && !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: CardsData }>("/report-cards/class", {
          params: { examId, classId, studentId, sectionId, print: 1 },
        })
      ).data.data,
  });
  const d = q.data;

  if (!examId || !classId)
    return (
      <p className="p-8 text-center text-sm text-slate-600">
        This link is missing the exam or class.
      </p>
    );
  if (q.isLoading)
    return <Loader2 className="mx-auto mt-20 animate-spin text-slate-400" />;
  if (q.isError)
    return (
      <p className="p-8 text-center text-sm text-rose-600">
        {apiMessage(q.error, "Could not load the report cards")}
      </p>
    );
  if (!d) return null;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          <strong>{d.cards.length}</strong> report card
          {d.cards.length === 1 ? "" : "s"} · {d.exam.name} · {d.className}.
          Choose <strong>Save as PDF</strong> as the printer to get a PDF file.
        </p>
        <button
          className="btn-primary"
          onClick={() => window.print()}
          disabled={d.cards.length === 0}
        >
          <Printer size={16} />
          Print / Save as PDF
        </button>
      </div>
      <div className="space-y-6 p-4 print:space-y-0 print:p-0">
        {d.cards.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            No report cards to show.
          </p>
        )}
        {d.cards.map((c) => (
          <ReportCardView key={c.student.id} data={d} card={c} />
        ))}
      </div>
    </div>
  );
}

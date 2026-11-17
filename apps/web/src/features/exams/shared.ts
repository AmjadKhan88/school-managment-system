export type ExamStatus = "DRAFT" | "PUBLISHED" | "COMPLETED";

export const EXAM_TYPE_LABEL: Record<string, string> = {
  MONTHLY_TEST: "Monthly Test",
  WEEKLY_TEST: "Weekly Test",
  MIDTERM: "Midterm",
  FINAL: "Final Examination",
  PRACTICAL: "Practical Examination",
  ANNUAL: "Annual Examination",
};
export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  COMPLETED: "Completed",
};
export const EXAM_STATUS_STYLE: Record<ExamStatus, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-slate-200 text-slate-600",
};

export interface ExamClassInfo {
  classId: string;
  className: string;
  totalMarks: number;
  passingMarks: number;
}
export interface ExamRow {
  id: string;
  name: string;
  type: string;
  status: ExamStatus;
  sessionId: string;
  sessionName: string;
  startDate: string;
  endDate: string;
  gradingScaleId: string | null;
  gradingScaleName: string | null;
  notes: string | null;
  classes: ExamClassInfo[];
  papers: number;
  scheduled: number;
}

export const toIso = (d: string) => d.slice(0, 10);

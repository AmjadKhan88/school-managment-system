import { Prisma } from "@prisma/client";

type Dec = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

export type MarkStatus = "ENTERED" | "ABSENT" | "EXEMPT";
export interface PaperInfo {
  id: string;
  name: string;
  totalMarks: number;
  practicalMarks: number;
  passingMarks: number;
}
export interface MarkInfo {
  status: MarkStatus;
  theory: Dec | null;
  practical: Dec | null;
}
export interface Band {
  grade: string;
  minPercent: number;
  gradePoint: number;
}

export const markTotal = (m: MarkInfo): Dec =>
  (m.theory ?? ZERO).plus(m.practical ?? ZERO);
const percentOf = (part: Dec, whole: Dec) =>
  whole.gt(0) ? part.div(whole).mul(100).toDecimalPlaces(2) : null;

/** The grade a percentage earns: the band with the highest minimum not above it. */
export function gradeFor(bands: Band[], percent: Dec | number): Band | null {
  const p = Number(percent);
  return (
    [...bands]
      .sort((a, b) => b.minPercent - a.minPercent)
      .find((b) => p >= b.minPercent) ?? null
  );
}

export interface SubjectOutcome {
  paperId: string;
  status: MarkStatus | null;
  obtained: Dec | null;
  grade: string | null;
  gradePoint: number | null;
  passed: boolean | null;
}
export interface Outcome {
  subjects: SubjectOutcome[];
  complete: boolean;
  totalObtained: Dec;
  totalMax: Dec;
  percentage: Dec | null;
  grade: string | null;
  gpa: Dec | null;
  result: "PASS" | "FAIL" | "INCOMPLETE";
  failedSubjects: number;
}

/**
 * One student's outcome. Absent = 0 marks and a fail. Exempt papers are left out of totals and of the pass check.
 * A missing mark makes the outcome INCOMPLETE. PASS needs every counted paper to reach its passing marks.
 */
export function computeOutcome(
  papers: PaperInfo[],
  marks: Map<string, MarkInfo>,
  bands: Band[],
): Outcome {
  let totalObtained = ZERO;
  let totalMax = ZERO;
  let failed = 0;
  let points = ZERO;
  let counted = 0;

  const subjects: SubjectOutcome[] = papers.map((p) => {
    const m = marks.get(p.id);
    if (!m)
      return {
        paperId: p.id,
        status: null,
        obtained: null,
        grade: null,
        gradePoint: null,
        passed: null,
      };
    if (m.status === "EXEMPT")
      return {
        paperId: p.id,
        status: "EXEMPT",
        obtained: null,
        grade: null,
        gradePoint: null,
        passed: null,
      };

    totalMax = totalMax.plus(p.totalMarks);
    counted++;
    if (m.status === "ABSENT") {
      failed++;
      return {
        paperId: p.id,
        status: "ABSENT",
        obtained: ZERO,
        grade: null,
        gradePoint: 0,
        passed: false,
      };
    }
    const obtained = markTotal(m);
    totalObtained = totalObtained.plus(obtained);
    const band = gradeFor(
      bands,
      percentOf(obtained, new Prisma.Decimal(p.totalMarks)) ?? ZERO,
    );
    const passed = obtained.gte(p.passingMarks);
    if (!passed) failed++;
    points = points.plus(band?.gradePoint ?? 0);
    return {
      paperId: p.id,
      status: "ENTERED",
      obtained,
      grade: band?.grade ?? null,
      gradePoint: band?.gradePoint ?? 0,
      passed,
    };
  });

  const complete = subjects.every((s) => s.status !== null);
  const percentage = percentOf(totalObtained, totalMax);
  return {
    subjects,
    complete,
    totalObtained,
    totalMax,
    percentage,
    grade: percentage ? (gradeFor(bands, percentage)?.grade ?? null) : null,
    gpa: counted > 0 ? points.div(counted).toDecimalPlaces(2) : null,
    result: !complete ? "INCOMPLETE" : failed > 0 ? "FAIL" : "PASS",
    failedSubjects: failed,
  };
}

/** Positions for students who passed, by percentage. Ties share a position (1, 2, 2, 4). */
export function rankPass(
  items: { key: string; percentage: Dec | null; result: string }[],
) {
  const passers = items
    .filter((i) => i.result === "PASS" && i.percentage)
    .sort((a, b) => b.percentage!.comparedTo(a.percentage!));
  const out = new Map<string, number>();
  let rank = 0;
  passers.forEach((p, i) => {
    if (i === 0 || !p.percentage!.eq(passers[i - 1].percentage!)) rank = i + 1;
    out.set(p.key, rank);
  });
  return out;
}

export interface EntryCheck {
  status: MarkStatus | null;
  theory?: number;
  practical?: number;
}

/** Returns a message when the marks are not valid for the paper, otherwise null. */
export function validateEntry(
  paper: { totalMarks: number; practicalMarks: number },
  e: EntryCheck,
): string | null {
  if (e.status !== "ENTERED") return null;
  const twoDecimals = (n: number) =>
    Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  const theoryMax = paper.totalMarks - paper.practicalMarks;

  const theory = e.theory ?? (theoryMax === 0 ? 0 : undefined);
  if (theory === undefined)
    return paper.practicalMarks > 0 ? "Enter theory marks" : "Enter marks";
  if (!twoDecimals(theory)) return "Marks can have at most 2 decimal places";
  if (theory > theoryMax) return `Theory marks cannot exceed ${theoryMax}`;

  if (paper.practicalMarks > 0) {
    if (e.practical === undefined) return "Enter practical marks";
    if (!twoDecimals(e.practical))
      return "Marks can have at most 2 decimal places";
    if (e.practical > paper.practicalMarks)
      return `Practical marks cannot exceed ${paper.practicalMarks}`;
  } else if (e.practical !== undefined && e.practical > 0) {
    return "This paper has no practical marks";
  }
  return null;
}

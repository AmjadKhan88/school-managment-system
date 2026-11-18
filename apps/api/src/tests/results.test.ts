import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { saveGridSchema } from "../modules/exams/marks.schema";
import {
  Band,
  computeOutcome,
  MarkInfo,
  PaperInfo,
  rankPass,
  validateEntry,
} from "../modules/exams/results.calc";

const D = (n: number) => new Prisma.Decimal(n);
const bands: Band[] = [
  { grade: "A+", minPercent: 90, gradePoint: 4 },
  { grade: "A", minPercent: 80, gradePoint: 3.7 },
  { grade: "B", minPercent: 70, gradePoint: 3 },
  { grade: "C", minPercent: 60, gradePoint: 2 },
  { grade: "D", minPercent: 50, gradePoint: 1 },
  { grade: "F", minPercent: 0, gradePoint: 0 },
];
const papers: PaperInfo[] = [
  {
    id: "m",
    name: "Maths",
    totalMarks: 100,
    practicalMarks: 0,
    passingMarks: 33,
  },
  {
    id: "e",
    name: "English",
    totalMarks: 100,
    practicalMarks: 0,
    passingMarks: 33,
  },
  {
    id: "s",
    name: "Science",
    totalMarks: 100,
    practicalMarks: 25,
    passingMarks: 33,
  },
];
const entered = (
  theory: number,
  practical: number | null = null,
): MarkInfo => ({
  status: "ENTERED",
  theory: D(theory),
  practical: practical === null ? null : D(practical),
});
const marks = (o: Record<string, MarkInfo>) => new Map(Object.entries(o));

describe("result calculation", () => {
  it("totals, percentage, grade, GPA and pass", () => {
    const r = computeOutcome(
      papers,
      marks({ m: entered(90), e: entered(80), s: entered(60, 20) }),
      bands,
    );
    expect(r.totalObtained.toFixed(2)).toBe("250.00");
    expect(r.totalMax.toFixed(2)).toBe("300.00");
    expect(r.percentage?.toFixed(2)).toBe("83.33");
    expect(r.grade).toBe("A");
    expect(r.gpa?.toFixed(2)).toBe("3.80");
    expect(r.result).toBe("PASS");
  });
  it("fails when any paper is below its passing marks", () => {
    const r = computeOutcome(
      papers,
      marks({ m: entered(90), e: entered(20), s: entered(60, 20) }),
      bands,
    );
    expect(r.result).toBe("FAIL");
    expect(r.failedSubjects).toBe(1);
  });
  it("counts absent as zero and a fail, but keeps the paper in the total", () => {
    const r = computeOutcome(
      papers,
      marks({
        m: entered(90),
        e: { status: "ABSENT", theory: null, practical: null },
        s: entered(60, 20),
      }),
      bands,
    );
    expect(r.totalMax.toFixed(2)).toBe("300.00");
    expect(r.result).toBe("FAIL");
  });
  it("leaves exempt papers out of totals and the pass check", () => {
    const r = computeOutcome(
      papers,
      marks({
        m: entered(90),
        e: { status: "EXEMPT", theory: null, practical: null },
        s: entered(60, 20),
      }),
      bands,
    );
    expect(r.totalMax.toFixed(2)).toBe("200.00");
    expect(r.percentage?.toFixed(2)).toBe("85.00");
    expect(r.result).toBe("PASS");
  });
  it("is incomplete while a mark is missing", () => {
    const r = computeOutcome(papers, marks({ m: entered(90) }), bands);
    expect(r.complete).toBe(false);
    expect(r.result).toBe("INCOMPLETE");
  });
  it("grades on the rounded percentage", () => {
    const one: PaperInfo[] = [
      { id: "x", name: "X", totalMarks: 3, practicalMarks: 0, passingMarks: 1 },
    ];
    // 2.9999 / 3 is 99.99666..., which displays as 100.00
    const r = computeOutcome(one, marks({ x: entered(2.99) }), bands);
    expect(r.percentage?.toFixed(2)).toBe("99.67");
    expect(r.grade).toBe("A+");
  });
});

describe("class positions", () => {
  const p = (key: string, pct: number, result = "PASS") => ({
    key,
    percentage: D(pct),
    result,
  });
  it("ranks passers and shares tied positions", () => {
    const r = rankPass([p("a", 90), p("b", 85), p("c", 85), p("d", 70)]);
    expect([r.get("a"), r.get("b"), r.get("c"), r.get("d")]).toEqual([
      1, 2, 2, 4,
    ]);
  });
  it("gives no position to failed or incomplete students", () => {
    const r = rankPass([
      p("a", 90),
      p("b", 95, "FAIL"),
      p("c", 80, "INCOMPLETE"),
    ]);
    expect(r.get("a")).toBe(1);
    expect(r.has("b")).toBe(false);
    expect(r.has("c")).toBe(false);
  });
});

describe("mark entry validation", () => {
  const plain = { totalMarks: 100, practicalMarks: 0 };
  const lab = { totalMarks: 100, practicalMarks: 25 };
  it("accepts valid marks and ignores absent or exempt", () => {
    expect(validateEntry(plain, { status: "ENTERED", theory: 100 })).toBeNull();
    expect(validateEntry(plain, { status: "ABSENT" })).toBeNull();
    expect(validateEntry(plain, { status: null })).toBeNull();
  });
  it("rejects marks above the maximum", () => {
    expect(validateEntry(plain, { status: "ENTERED", theory: 101 })).toMatch(
      /cannot exceed 100/,
    );
    expect(
      validateEntry(lab, { status: "ENTERED", theory: 76, practical: 10 }),
    ).toMatch(/cannot exceed 75/);
    expect(
      validateEntry(lab, { status: "ENTERED", theory: 50, practical: 26 }),
    ).toMatch(/cannot exceed 25/);
  });
  it("needs the right components", () => {
    expect(validateEntry(plain, { status: "ENTERED" })).toMatch(/Enter marks/);
    expect(validateEntry(lab, { status: "ENTERED", theory: 50 })).toMatch(
      /practical/,
    );
    expect(
      validateEntry(plain, { status: "ENTERED", theory: 50, practical: 5 }),
    ).toMatch(/no practical/);
  });
  it("allows at most two decimals", () => {
    expect(
      validateEntry(plain, { status: "ENTERED", theory: 55.5 }),
    ).toBeNull();
    expect(validateEntry(plain, { status: "ENTERED", theory: 55.555 })).toMatch(
      /2 decimal/,
    );
  });
  it("accepts a practical-only paper without theory marks", () => {
    expect(
      validateEntry(
        { totalMarks: 50, practicalMarks: 50 },
        { status: "ENTERED", practical: 40 },
      ),
    ).toBeNull();
  });
});

describe("save payload", () => {
  const base = {
    examId: "e",
    classId: "c",
    subjectId: "s",
    entries: [{ enrollmentId: "x", status: "ENTERED", theory: "45" }],
  };
  it('accepts numbers as text and null as "no mark"', () => {
    expect(saveGridSchema.safeParse(base).success).toBe(true);
    expect(
      saveGridSchema.safeParse({
        ...base,
        entries: [{ enrollmentId: "x", status: null }],
      }).success,
    ).toBe(true);
  });
  it("rejects a student twice and an unknown status", () => {
    expect(
      saveGridSchema.safeParse({
        ...base,
        entries: [...base.entries, ...base.entries],
      }).success,
    ).toBe(false);
    expect(
      saveGridSchema.safeParse({
        ...base,
        entries: [{ enrollmentId: "x", status: "SICK" }],
      }).success,
    ).toBe(false);
  });
});

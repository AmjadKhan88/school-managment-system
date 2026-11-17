import { describe, expect, it } from "vitest";
import { findConflicts, Slot, timesOverlap } from "../modules/exams/exams.calc";
import {
  examSchema,
  scaleSchema,
  scheduleSchema,
} from "../modules/exams/exams.schema";
import {
  bandRanges,
  resolveBand,
  validateBands,
} from "../modules/exams/grading.calc";

const bands = [
  { grade: "A+", minPercent: 90, gradePoint: 4 },
  { grade: "A", minPercent: 80, gradePoint: 3.7 },
  { grade: "B", minPercent: 70, gradePoint: 3 },
  { grade: "F", minPercent: 0, gradePoint: 0 },
];

describe("grading", () => {
  it("gives a percentage the highest grade it reaches", () => {
    expect(resolveBand(bands, 95)?.grade).toBe("A+");
    expect(resolveBand(bands, 90)?.grade).toBe("A+");
    expect(resolveBand(bands, 89.99)?.grade).toBe("A");
    expect(resolveBand(bands, 0)?.grade).toBe("F");
    expect(resolveBand(bands, 45)?.grade).toBe("F");
  });
  it("builds display ranges without gaps", () => {
    expect(bandRanges(bands).map((r) => [r.grade, r.from, r.to])).toEqual([
      ["A+", 90, 100],
      ["A", 80, 89.99],
      ["B", 70, 79.99],
      ["F", 0, 69.99],
    ]);
  });
  it("accepts a valid scale", () => expect(validateBands(bands)).toEqual([]));
  it("requires the lowest grade to start at 0", () =>
    expect(validateBands(bands.filter((b) => b.minPercent > 0)).join()).toMatch(
      /0%/,
    ));
  it("rejects duplicate grade names and duplicate minimums", () => {
    expect(
      validateBands([
        ...bands,
        { grade: "a", minPercent: 50, gradePoint: 1 },
      ]).join(),
    ).toMatch(/same name/);
    expect(
      validateBands([
        ...bands,
        { grade: "X", minPercent: 80, gradePoint: 1 },
      ]).join(),
    ).toMatch(/same percentage/);
  });
  it("validates the payload", () => {
    expect(
      scaleSchema.safeParse({
        name: "Std",
        bands: [{ grade: "F", minPercent: 0, gradePoint: 0 }],
      }).success,
    ).toBe(true);
    expect(scaleSchema.safeParse({ name: "Std", bands: [] }).success).toBe(
      false,
    );
  });
});

describe("time overlap", () => {
  it("detects overlap but not touching ends", () => {
    expect(timesOverlap("09:00", "11:00", "10:00", "12:00")).toBe(true);
    expect(timesOverlap("09:00", "11:00", "11:00", "12:00")).toBe(false);
  });
});

describe("schedule conflicts", () => {
  const slot = (over: Partial<Slot>): Slot => ({
    classId: "c1",
    label: "Class 5 Maths",
    date: "2026-12-01",
    start: "09:00",
    end: "11:00",
    room: "R1",
    touched: true,
    ...over,
  });
  it("flags a class with two overlapping papers", () => {
    expect(
      findConflicts([
        slot({}),
        slot({
          label: "Class 5 English",
          start: "10:00",
          end: "12:00",
          room: "R2",
        }),
      ]).join(),
    ).toMatch(/same class/);
  });
  it("flags a room used twice at the same time by different classes", () => {
    expect(
      findConflicts([
        slot({}),
        slot({ classId: "c2", label: "Class 6 Maths" }),
      ]).join(),
    ).toMatch(/Room "R1"/);
  });
  it("allows the same room on different days or times", () => {
    expect(
      findConflicts([
        slot({}),
        slot({ classId: "c2", date: "2026-12-02" }),
        slot({ classId: "c3", start: "11:00", end: "13:00" }),
      ]),
    ).toEqual([]);
  });
  it("ignores clashes between papers that are not being saved", () => {
    expect(
      findConflicts([
        slot({ touched: false }),
        slot({ classId: "c2", touched: false }),
      ]),
    ).toEqual([]);
  });
});

describe("exam payloads", () => {
  const exam = {
    name: "Midterm 2026",
    type: "MIDTERM",
    sessionId: "s",
    startDate: "2026-12-01",
    endDate: "2026-12-10",
    classes: [{ classId: "c", totalMarks: 100, passingMarks: 33 }],
  };
  it("accepts a valid exam", () =>
    expect(examSchema.safeParse(exam).success).toBe(true));
  it("rejects bad dates, duplicate classes and passing above total", () => {
    expect(
      examSchema.safeParse({ ...exam, endDate: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      examSchema.safeParse({
        ...exam,
        classes: [...exam.classes, ...exam.classes],
      }).success,
    ).toBe(false);
    expect(
      examSchema.safeParse({
        ...exam,
        classes: [{ classId: "c", totalMarks: 50, passingMarks: 60 }],
      }).success,
    ).toBe(false);
  });
  const row = {
    subjectId: "m",
    examDate: "2026-12-02",
    startTime: "09:00",
    endTime: "11:00",
    totalMarks: 100,
    passingMarks: 33,
  };
  it("accepts a scheduled paper", () =>
    expect(
      scheduleSchema.safeParse({ classId: "c", rows: [row] }).success,
    ).toBe(true));
  it("needs both times with a date, and a later end time", () => {
    expect(
      scheduleSchema.safeParse({
        classId: "c",
        rows: [{ ...row, endTime: "" }],
      }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        classId: "c",
        rows: [{ ...row, endTime: "08:00" }],
      }).success,
    ).toBe(false);
  });
  it("allows an unscheduled paper", () => {
    expect(
      scheduleSchema.safeParse({
        classId: "c",
        rows: [{ subjectId: "m", totalMarks: 100, passingMarks: 33 }],
      }).success,
    ).toBe(true);
  });
});

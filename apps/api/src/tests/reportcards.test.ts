import { describe, expect, it } from "vitest";
import { normalise, sameRemark } from "../modules/exams/reportcards.calc";
import {
  cardsQuerySchema,
  remarksSchema,
} from "../modules/exams/reportcards.schema";

describe("remark helpers", () => {
  it("treats blank text as no remark", () => {
    expect(normalise("   ")).toBeNull();
    expect(normalise(undefined)).toBeNull();
    expect(normalise("  Well done  ")).toBe("Well done");
  });
  it("compares remarks ignoring spacing and blanks", () => {
    expect(sameRemark(" Good ", "Good")).toBe(true);
    expect(sameRemark("", null)).toBe(true);
    expect(sameRemark("Good", "Great")).toBe(false);
  });
});

describe("payloads", () => {
  it("needs an exam and a class", () => {
    expect(
      cardsQuerySchema.safeParse({ examId: "e", classId: "c" }).success,
    ).toBe(true);
    expect(cardsQuerySchema.safeParse({ examId: "e" }).success).toBe(false);
  });
  const base = {
    examId: "e",
    classId: "c",
    entries: [{ studentId: "s", teacherRemarks: "Excellent effort" }],
  };
  it("accepts remarks, blanks and omitted fields", () => {
    expect(remarksSchema.safeParse(base).success).toBe(true);
    expect(
      remarksSchema.safeParse({
        ...base,
        entries: [{ studentId: "s", principalRemarks: null }],
      }).success,
    ).toBe(true);
  });
  it("rejects remarks over 300 characters and a student listed twice", () => {
    expect(
      remarksSchema.safeParse({
        ...base,
        entries: [{ studentId: "s", teacherRemarks: "x".repeat(301) }],
      }).success,
    ).toBe(false);
    expect(
      remarksSchema.safeParse({
        ...base,
        entries: [...base.entries, ...base.entries],
      }).success,
    ).toBe(false);
  });
});

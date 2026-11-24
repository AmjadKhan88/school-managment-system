import { describe, expect, it } from "vitest";
import {
  canSubmit,
  isLate,
  summarise,
  trackOf,
} from "../modules/homework/homework.calc";
import {
  homeworkEditSchema,
  homeworkSchema,
  recordSchema,
  reviewSchema,
} from "../modules/homework/homework.schema";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("late and tracking", () => {
  it("is late only after the due date, ignoring the time of day", () => {
    expect(isLate(d("2026-11-20"), new Date("2026-11-20T23:59:00Z"))).toBe(
      false,
    );
    expect(isLate(d("2026-11-20"), new Date("2026-11-21T00:01:00Z"))).toBe(
      true,
    );
  });
  it("shows pending, overdue, submitted, late, checked and redo", () => {
    const due = d("2026-11-20");
    expect(trackOf(null, due, d("2026-11-19"))).toBe("PENDING");
    expect(trackOf(null, due, d("2026-11-21"))).toBe("OVERDUE");
    expect(
      trackOf({ status: "SUBMITTED", late: false }, due, d("2026-11-25")),
    ).toBe("SUBMITTED");
    expect(
      trackOf({ status: "SUBMITTED", late: true }, due, d("2026-11-25")),
    ).toBe("LATE");
    expect(
      trackOf({ status: "CHECKED", late: true }, due, d("2026-11-25")),
    ).toBe("CHECKED");
    expect(trackOf({ status: "REDO", late: false }, due, d("2026-11-25"))).toBe(
      "REDO",
    );
  });
  it("counts done as submitted, late and checked, not redo", () => {
    const s = summarise([
      "SUBMITTED",
      "LATE",
      "CHECKED",
      "REDO",
      "PENDING",
      "OVERDUE",
    ]);
    expect(s).toMatchObject({
      total: 6,
      done: 3,
      redo: 1,
      pending: 1,
      overdue: 1,
      percent: 50,
    });
    expect(summarise([]).percent).toBe(0);
  });
});

describe("who may submit", () => {
  const hw = { status: "ACTIVE", dueDate: d("2026-11-20"), allowLate: true };
  it("allows an open homework, a resubmission and a redo", () => {
    expect(canSubmit(hw, null, d("2026-11-19"))).toBeNull();
    expect(canSubmit(hw, { status: "SUBMITTED" }, d("2026-11-19"))).toBeNull();
    expect(canSubmit(hw, { status: "REDO" }, d("2026-11-19"))).toBeNull();
  });
  it("refuses cancelled homework and work that is already checked", () => {
    expect(
      canSubmit({ ...hw, status: "CANCELLED" }, null, d("2026-11-19")),
    ).toMatch(/cancelled/);
    expect(canSubmit(hw, { status: "CHECKED" }, d("2026-11-19"))).toMatch(
      /already checked/,
    );
  });
  it("refuses late work only when late work is not allowed", () => {
    expect(canSubmit(hw, null, d("2026-11-25"))).toBeNull();
    expect(
      canSubmit({ ...hw, allowLate: false }, null, d("2026-11-25")),
    ).toMatch(/deadline/);
  });
});

describe("assigning homework", () => {
  const base = {
    sessionId: "s",
    sectionIds: '["a","b"]',
    subjectId: "x",
    title: "Chapter 4 exercises",
    assignedOn: inDays(0),
    dueDate: inDays(3),
    allowLate: "false",
  };
  it("reads multipart text fields: a JSON list of sections and a text flag", () => {
    const r = homeworkSchema.parse(base);
    expect(r.sectionIds).toEqual(["a", "b"]);
    expect(r.allowLate).toBe(false);
    expect(
      homeworkSchema.parse({ ...base, sectionIds: "a,b", allowLate: undefined })
        .allowLate,
    ).toBe(true);
  });
  it("rejects a due date before the assigned date, a very distant one, and too old or far assigned dates", () => {
    expect(
      homeworkSchema.safeParse({ ...base, dueDate: inDays(-1) }).success,
    ).toBe(false);
    expect(
      homeworkSchema.safeParse({ ...base, dueDate: inDays(200) }).success,
    ).toBe(false);
    expect(
      homeworkSchema.safeParse({
        ...base,
        assignedOn: inDays(-10),
        dueDate: inDays(-5),
      }).success,
    ).toBe(false);
    expect(
      homeworkSchema.safeParse({
        ...base,
        assignedOn: inDays(40),
        dueDate: inDays(45),
      }).success,
    ).toBe(false);
  });
  it("needs a title and at least one section", () => {
    expect(homeworkSchema.safeParse({ ...base, title: "ab" }).success).toBe(
      false,
    );
    expect(
      homeworkSchema.safeParse({ ...base, sectionIds: "[]" }).success,
    ).toBe(false);
  });
  it("validates an edit, allowing marks to be cleared", () => {
    expect(
      homeworkEditSchema.safeParse({
        title: "New title",
        dueDate: inDays(5),
        maxMarks: null,
        allowLate: true,
      }).success,
    ).toBe(true);
    expect(
      homeworkEditSchema.safeParse({
        title: "New title",
        dueDate: inDays(5),
        maxMarks: 0,
        allowLate: true,
      }).success,
    ).toBe(false);
  });
});

describe("review and record", () => {
  it("needs feedback for a redo and allows marks only with a check", () => {
    expect(
      reviewSchema.safeParse({ status: "CHECKED", marks: 8, feedback: "Good" })
        .success,
    ).toBe(true);
    expect(reviewSchema.safeParse({ status: "CHECKED" }).success).toBe(true);
    expect(reviewSchema.safeParse({ status: "REDO" }).success).toBe(false);
    expect(
      reviewSchema.safeParse({ status: "REDO", feedback: "Show your working" })
        .success,
    ).toBe(true);
    expect(
      reviewSchema.safeParse({ status: "REDO", feedback: "x", marks: 3 })
        .success,
    ).toBe(false);
  });
  it("treats a blank record date as today", () => {
    expect(recordSchema.parse({ submittedOn: "" }).submittedOn).toBeUndefined();
    expect(
      recordSchema.parse({ submittedOn: "2026-11-20" }).submittedOn,
    ).toBeInstanceOf(Date);
  });
});

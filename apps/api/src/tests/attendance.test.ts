import { describe, expect, it } from "vitest";
import {
  addStatus,
  attendancePercent,
  emptyCounts,
  recorded,
  withinEditWindow,
} from "../modules/attendance/attendance.calc";
import { saveRegisterSchema } from "../modules/attendance/attendance.schema";

const counts = (p: number, a: number, l = 0, v = 0, h = 0) => ({
  present: p,
  absent: a,
  late: l,
  leave: v,
  halfDay: h,
});

describe("attendance percent", () => {
  it("is present over recorded days", () =>
    expect(attendancePercent(counts(18, 2))).toBe(90));
  it("counts late as attended and half day as half", () =>
    expect(attendancePercent(counts(8, 0, 1, 0, 2))).toBe(
      (100 * (8 + 1 + 1)) / 11 > 90 ? 90.9 : 0,
    ));
  it("leaves approved leave out of the days counted", () =>
    expect(attendancePercent(counts(8, 2, 0, 5))).toBe(80));
  it("is null when nothing is recorded or all days are leave", () => {
    expect(attendancePercent(emptyCounts())).toBeNull();
    expect(attendancePercent(counts(0, 0, 0, 3))).toBeNull();
  });
});

describe("counting", () => {
  it("adds each status to its own bucket", () => {
    const c = emptyCounts();
    (
      ["PRESENT", "PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"] as const
    ).forEach((s) => addStatus(c, s));
    expect(c).toEqual(counts(2, 1, 1, 1, 1));
    expect(recorded(c)).toBe(6);
  });
});

describe("edit window", () => {
  const today = new Date("2026-11-15T00:00:00Z");
  it("allows the last 7 days", () =>
    expect(withinEditWindow(new Date("2026-11-08T00:00:00Z"), today)).toBe(
      true,
    ));
  it("locks older days", () =>
    expect(withinEditWindow(new Date("2026-11-07T00:00:00Z"), today)).toBe(
      false,
    ));
});

describe("save payload", () => {
  const base = {
    sessionId: "s",
    classId: "c",
    sectionId: "x",
    date: "2026-11-10",
    entries: [{ enrollmentId: "e1", status: "PRESENT" }],
  };
  it("accepts a valid register", () =>
    expect(saveRegisterSchema.safeParse(base).success).toBe(true));
  it("rejects a student listed twice", () =>
    expect(
      saveRegisterSchema.safeParse({
        ...base,
        entries: [...base.entries, ...base.entries],
      }).success,
    ).toBe(false));
  it("rejects a future date and an unknown status", () => {
    expect(
      saveRegisterSchema.safeParse({ ...base, date: "2999-01-01" }).success,
    ).toBe(false);
    expect(
      saveRegisterSchema.safeParse({
        ...base,
        entries: [{ enrollmentId: "e1", status: "SICK" }],
      }).success,
    ).toBe(false);
  });
});

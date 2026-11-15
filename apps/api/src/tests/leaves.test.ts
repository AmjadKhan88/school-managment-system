import { describe, expect, it } from "vitest";
import { leaveDays, overlaps } from "../modules/leaves/leave.calc";
import { leaveSchema } from "../modules/leaves/leaves.schema";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("leave days", () => {
  it("counts both ends", () => {
    expect(leaveDays(d("2026-11-10"), d("2026-11-10"))).toBe(1);
    expect(leaveDays(d("2026-11-10"), d("2026-11-12"))).toBe(3);
  });
});

describe("overlap", () => {
  it("detects shared days, including touching ends", () => {
    expect(
      overlaps(
        d("2026-11-10"),
        d("2026-11-12"),
        d("2026-11-12"),
        d("2026-11-14"),
      ),
    ).toBe(true);
    expect(
      overlaps(
        d("2026-11-10"),
        d("2026-11-12"),
        d("2026-11-13"),
        d("2026-11-14"),
      ),
    ).toBe(false);
  });
});

describe("leave payload", () => {
  const base = {
    studentId: "s",
    leaveType: "SICK",
    startDate: inDays(1),
    endDate: inDays(2),
    reason: "Fever and doctor visit",
  };
  it("accepts a valid application", () =>
    expect(leaveSchema.safeParse(base).success).toBe(true));
  it("rejects an end before the start", () =>
    expect(leaveSchema.safeParse({ ...base, endDate: inDays(0) }).success).toBe(
      false,
    ));
  it("rejects leave longer than 60 days", () =>
    expect(
      leaveSchema.safeParse({ ...base, endDate: inDays(80) }).success,
    ).toBe(false));
  it("rejects leave that started over 30 days ago", () =>
    expect(
      leaveSchema.safeParse({
        ...base,
        startDate: inDays(-40),
        endDate: inDays(-39),
      }).success,
    ).toBe(false));
  it("needs a reason", () =>
    expect(leaveSchema.safeParse({ ...base, reason: "ill" }).success).toBe(
      false,
    ));
});

import { describe, expect, it } from "vitest";
import {
  saveStaffRegisterSchema,
  staffReportQuerySchema,
} from "../modules/staff/staffattendance.schema";
import { staffLeaveSchema } from "../modules/staff/staffleaves.schema";

const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("staff register payload", () => {
  const base = {
    date: "2026-11-10",
    group: "teachers",
    entries: [
      {
        employeeId: "e1",
        status: "PRESENT",
        checkIn: "08:05",
        checkOut: "14:30",
      },
    ],
  };
  it("accepts a valid register, with or without times", () => {
    expect(saveStaffRegisterSchema.safeParse(base).success).toBe(true);
    expect(
      saveStaffRegisterSchema.safeParse({
        ...base,
        entries: [
          { employeeId: "e1", status: "ABSENT", checkIn: "", checkOut: "" },
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects a bad time, an end before the start, a duplicate and a future date", () => {
    expect(
      saveStaffRegisterSchema.safeParse({
        ...base,
        entries: [{ employeeId: "e1", status: "PRESENT", checkIn: "8am" }],
      }).success,
    ).toBe(false);
    expect(
      saveStaffRegisterSchema.safeParse({
        ...base,
        entries: [
          {
            employeeId: "e1",
            status: "PRESENT",
            checkIn: "09:00",
            checkOut: "08:00",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      saveStaffRegisterSchema.safeParse({
        ...base,
        entries: [...base.entries, ...base.entries],
      }).success,
    ).toBe(false);
    expect(
      saveStaffRegisterSchema.safeParse({ ...base, date: "2999-01-01" })
        .success,
    ).toBe(false);
  });
  it("only accepts the two groups", () => {
    expect(
      saveStaffRegisterSchema.safeParse({ ...base, group: "everyone" }).success,
    ).toBe(false);
  });
});

describe("staff report query", () => {
  it("treats blanks as not provided", () => {
    const q = staffReportQuerySchema.parse({ group: "", month: "" });
    expect(q.group).toBeUndefined();
    expect(q.month).toBeUndefined();
  });
  it("rejects a malformed month", () =>
    expect(staffReportQuerySchema.safeParse({ month: "2026-13" }).success).toBe(
      false,
    ));
});

describe("staff leave payload", () => {
  const base = {
    leaveType: "ANNUAL",
    startDate: inDays(5),
    endDate: inDays(8),
    reason: "Family wedding out of town",
  };
  it("accepts staff-only leave types and an omitted employee", () => {
    expect(staffLeaveSchema.safeParse(base).success).toBe(true);
    expect(
      staffLeaveSchema.safeParse({ ...base, leaveType: "MATERNITY" }).success,
    ).toBe(true);
    expect(
      staffLeaveSchema.safeParse({
        ...base,
        leaveType: "UNPAID",
        employeeId: "e1",
      }).success,
    ).toBe(true);
  });
  it("applies the same date rules as student leave", () => {
    expect(
      staffLeaveSchema.safeParse({ ...base, endDate: inDays(1) }).success,
    ).toBe(false);
    expect(
      staffLeaveSchema.safeParse({ ...base, endDate: inDays(90) }).success,
    ).toBe(false);
    expect(
      staffLeaveSchema.safeParse({
        ...base,
        startDate: inDays(-40),
        endDate: inDays(-39),
      }).success,
    ).toBe(false);
    expect(staffLeaveSchema.safeParse({ ...base, reason: "ill" }).success).toBe(
      false,
    );
  });
  it("rejects an unknown type", () =>
    expect(
      staffLeaveSchema.safeParse({ ...base, leaveType: "HOLIDAY" }).success,
    ).toBe(false));
});

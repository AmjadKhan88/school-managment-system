import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  absenceDeductionFor,
  ComponentInput,
  computedAbsence,
  computePay,
  defaultOvertimeRate,
  outsideDays,
  summariseAttendance,
} from "../modules/payroll/payroll.calc";
import {
  draftEditSchema,
  loanSchema,
  paymentSchema,
  structureSchema,
} from "../modules/payroll/payroll.schema";

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const comp = (
  label: string,
  type: "ALLOWANCE" | "DEDUCTION",
  isPercent: boolean,
  value: number,
): ComponentInput => ({ label, type, isPercent, value: D(value) });
const base = {
  basic: D(50000),
  bonus: D(0),
  overtimeHours: D(0),
  overtimeRate: D(0),
  absenceDays: D(0),
  loans: [],
  components: [] as ComponentInput[],
};

describe("net salary", () => {
  it("follows the formula", () => {
    const r = computePay({
      basic: D(50000),
      bonus: D(1000),
      overtimeHours: D(5),
      overtimeRate: defaultOvertimeRate(D(50000)),
      absenceDays: D(2),
      components: [
        comp("House Rent", "ALLOWANCE", true, 20),
        comp("Medical", "ALLOWANCE", false, 2000),
        comp("Provident Fund", "DEDUCTION", true, 5),
      ],
      loans: [{ loanId: "l1", label: "Advance", due: D(5000) }],
    });
    expect(defaultOvertimeRate(D(50000)).toFixed(2)).toBe("208.33");
    expect(r.allowancesTotal.toFixed(2)).toBe("12000.00");
    expect(r.overtimeAmount.toFixed(2)).toBe("1041.65");
    expect(r.deductionsTotal.toFixed(2)).toBe("2500.00");
    expect(r.absenceDeduction.toFixed(2)).toBe("3333.33");
    expect(r.loanRecovery.toFixed(2)).toBe("5000.00");
    // 50000 + 12000 + 1000 + 1041.65 - 2500 - 3333.33 - 5000
    expect(r.netSalary.toFixed(2)).toBe("53208.32");
    expect(r.negative).toBe(false);
  });
  it("lists the lines in order", () => {
    const r = computePay({
      ...base,
      bonus: D(500),
      absenceDays: D(1),
      components: [comp("Tax", "DEDUCTION", false, 100)],
    });
    expect(r.lines.map((l) => l.kind)).toEqual([
      "BASIC",
      "BONUS",
      "DEDUCTION",
      "ABSENCE",
    ]);
  });
  it("caps a loan instalment at what the salary can cover and postpones the rest", () => {
    const r = computePay({
      ...base,
      basic: D(10000),
      components: [comp("Tax", "DEDUCTION", false, 9000)],
      loans: [{ loanId: "l1", label: "Loan", due: D(5000) }],
    });
    expect(r.loanRecovery.toFixed(2)).toBe("1000.00");
    expect(r.postponed.toFixed(2)).toBe("4000.00");
    expect(r.netSalary.toFixed(2)).toBe("0.00");
  });
  it("flags a negative net and takes no loan", () => {
    const r = computePay({
      ...base,
      basic: D(1000),
      components: [comp("Tax", "DEDUCTION", false, 2000)],
      loans: [{ loanId: "l1", label: "Loan", due: D(500) }],
    });
    expect(r.negative).toBe(true);
    expect(r.loanRecovery.toFixed(2)).toBe("0.00");
    expect(r.netSalary.lt(0)).toBe(true);
  });
  it("never deducts more than the basic salary for absence", () => {
    expect(absenceDeductionFor(D(30000), D(31)).toFixed(2)).toBe("30000.00");
    expect(absenceDeductionFor(D(30000), D(0.5)).toFixed(2)).toBe("500.00");
  });
});

describe("attendance into absence", () => {
  const leaves = [
    { start: "2026-11-10", end: "2026-11-10", type: "CASUAL" },
    { start: "2026-11-11", end: "2026-11-11", type: "UNPAID" },
  ];
  const records = [
    { date: "2026-11-02", status: "PRESENT" as const },
    { date: "2026-11-03", status: "LATE" as const },
    { date: "2026-11-04", status: "ABSENT" as const },
    { date: "2026-11-05", status: "HALF_DAY" as const },
    { date: "2026-11-10", status: "LEAVE" as const },
    { date: "2026-11-11", status: "LEAVE" as const },
    { date: "2026-11-12", status: "LEAVE" as const },
  ];
  it("sorts each day into present, absent, half, paid, unpaid or uncovered leave", () => {
    expect(summariseAttendance(records, leaves)).toEqual({
      present: 2,
      halfDays: 1,
      absent: 1,
      paidLeave: 1,
      unpaidLeave: 1,
      uncoveredLeave: 1,
      recorded: 7,
    });
  });
  it("counts absent, half, unpaid and uncovered days (and days outside employment)", () => {
    const s = summariseAttendance(records, leaves);
    expect(computedAbsence(s, 0).toString()).toBe("3.5"); // 1 + 0.5 + 1 + 1
    expect(computedAbsence(s, 2).toString()).toBe("5.5");
  });
  it("counts days outside employment in the month", () => {
    expect(outsideDays("2026-11-01", "2026-11-30", "2026-11-11", null)).toBe(
      10,
    );
    expect(
      outsideDays("2026-11-01", "2026-11-30", "2026-01-01", "2026-11-20"),
    ).toBe(10);
    expect(outsideDays("2026-11-01", "2026-11-30", "2026-01-01", null)).toBe(0);
    expect(outsideDays("2026-11-01", "2026-11-30", "2027-01-01", null)).toBe(
      30,
    );
  });
});

describe("payloads", () => {
  it("validates structure and rejects a duplicate component", () => {
    expect(
      structureSchema.safeParse({
        basicSalary: 50000,
        items: [{ componentId: "a", value: 10 }],
      }).success,
    ).toBe(true);
    expect(
      structureSchema.safeParse({ basicSalary: 0, items: [] }).success,
    ).toBe(false);
    expect(
      structureSchema.safeParse({
        basicSalary: 50000,
        items: [
          { componentId: "a", value: 1 },
          { componentId: "a", value: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("needs a reason to override absence days and only allows half steps", () => {
    expect(draftEditSchema.safeParse({ absenceDays: 2 }).success).toBe(false);
    expect(
      draftEditSchema.safeParse({ absenceDays: 2, absenceNote: "Joined late" })
        .success,
    ).toBe(true);
    expect(
      draftEditSchema.safeParse({ absenceDays: 2.3, absenceNote: "x" }).success,
    ).toBe(false);
    const ok = draftEditSchema.parse({});
    expect(ok.bonus).toBe(0);
    expect(ok.overtimeHours).toBe(0);
  });
  it("validates a payment", () => {
    const p = {
      payrollId: "p",
      amount: 1000,
      paidOn: "2026-11-20",
      method: "CASH",
    };
    expect(paymentSchema.safeParse(p).success).toBe(true);
    expect(paymentSchema.safeParse({ ...p, amount: 0 }).success).toBe(false);
    expect(
      paymentSchema.safeParse({ ...p, paidOn: "2999-01-01" }).success,
    ).toBe(false);
    expect(paymentSchema.safeParse({ ...p, method: "BITCOIN" }).success).toBe(
      false,
    );
  });
  it("validates a loan", () => {
    const l = {
      employeeId: "e",
      type: "LOAN",
      amount: 120000,
      instalments: 12,
      startPeriod: "2026-12",
    };
    expect(loanSchema.safeParse(l).success).toBe(true);
    expect(
      loanSchema.safeParse({ ...l, type: "ADVANCE", instalments: 24 }).success,
    ).toBe(false);
    expect(loanSchema.safeParse({ ...l, instalments: 0 }).success).toBe(false);
  });
});

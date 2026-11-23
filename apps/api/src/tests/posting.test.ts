import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  countInconsistencies,
  loanExpenseText,
  monthLabel,
  salaryExpenseText,
} from "../modules/payroll/posting.calc";

const D = (n: number) => new Prisma.Decimal(n);

describe("posting texts", () => {
  it("names the month and the references", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(
      salaryExpenseText("2026-11", "SAL-2026-00003", "SPY-2026-00002"),
    ).toBe("Salary November 2026 (SAL-2026-00003, receipt SPY-2026-00002)");
    expect(loanExpenseText("ADVANCE", "LN-2026-00001")).toBe(
      "Advance LN-2026-00001 paid out",
    );
    expect(loanExpenseText("LOAN", "LN-2026-00002")).toBe(
      "Loan LN-2026-00002 paid out",
    );
  });
});

describe("consistency between payroll and the books", () => {
  const ok = { status: "APPROVED", amount: D(1000) };
  it("accepts a live payment with a matching approved expense and a reversed one with a voided expense", () => {
    expect(
      countInconsistencies([
        { reversed: false, amount: D(1000), expense: ok },
        {
          reversed: true,
          amount: D(1000),
          expense: { status: "VOIDED", amount: D(1000) },
        },
      ]),
    ).toBe(0);
  });
  it("flags a live payment whose expense was voided or differs in amount", () => {
    expect(
      countInconsistencies([
        {
          reversed: false,
          amount: D(1000),
          expense: { status: "VOIDED", amount: D(1000) },
        },
      ]),
    ).toBe(1);
    expect(
      countInconsistencies([
        {
          reversed: false,
          amount: D(1000),
          expense: { status: "APPROVED", amount: D(900) },
        },
      ]),
    ).toBe(1);
  });
  it("flags a reversed payment whose expense is still approved", () => {
    expect(
      countInconsistencies([{ reversed: true, amount: D(1000), expense: ok }]),
    ).toBe(1);
  });
  it("ignores payments that have no expense yet (counted as unposted instead)", () => {
    expect(
      countInconsistencies([
        { reversed: false, amount: D(1000), expense: null },
      ]),
    ).toBe(0);
  });
});

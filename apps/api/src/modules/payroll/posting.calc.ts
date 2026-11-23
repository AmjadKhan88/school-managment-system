import { Prisma } from "@prisma/client";

export const monthLabel = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const salaryExpenseText = (
  period: string,
  slipNo: string,
  receiptNo: string,
) => `Salary ${monthLabel(period)} (${slipNo}, receipt ${receiptNo})`;
export const loanExpenseText = (type: "ADVANCE" | "LOAN", loanNo: string) =>
  `${type === "ADVANCE" ? "Advance" : "Loan"} ${loanNo} paid out`;

export interface LinkRow {
  reversed: boolean;
  amount: Prisma.Decimal;
  expense: { status: string; amount: Prisma.Decimal } | null;
}

/**
 * Payments whose entry in the books is wrong: a live payment must have an approved expense of the same amount,
 * and a reversed payment must not still have an approved one. Payments with no expense yet are counted separately.
 */
export function countInconsistencies(rows: LinkRow[]): number {
  return rows.filter((r) => {
    if (!r.expense) return false;
    return r.reversed
      ? r.expense.status === "APPROVED"
      : r.expense.status !== "APPROVED" || !r.expense.amount.eq(r.amount);
  }).length;
}

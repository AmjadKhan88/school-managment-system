import { Prisma } from "@prisma/client";

const DAY = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Whole days from one date to another, ignoring the time of day. */
export const daysBetween = (from: Date, to: Date) =>
  Math.round((Date.parse(isoDay(to)) - Date.parse(isoDay(from))) / DAY);
export const addDays = (d: Date, n: number) =>
  new Date(Date.parse(isoDay(d)) + n * DAY);
export const overdueDays = (due: Date, on: Date) =>
  Math.max(0, daysBetween(due, on));
export const overdueFine = (
  due: Date,
  on: Date,
  perDay: Prisma.Decimal.Value,
) => new Prisma.Decimal(perDay).mul(overdueDays(due, on)).toDecimalPlaces(2);
export const formatAccession = (n: number) =>
  `LB-${String(n).padStart(6, "0")}`;

/** A reason a borrower may not take another book right now, or null. */
export function borrowBlock(s: {
  open: number;
  max: number;
  overdue: number;
  unpaid: Prisma.Decimal;
}): string | null {
  if (s.unpaid.gt(0))
    return `This borrower has unpaid library fines of ${s.unpaid.toFixed(2)}. Collect or waive them first.`;
  if (s.overdue > 0)
    return `This borrower has ${s.overdue} overdue book${s.overdue === 1 ? "" : "s"}. They must be returned first.`;
  if (s.open >= s.max)
    return `This borrower already has ${s.open} book${s.open === 1 ? "" : "s"} out. The limit is ${s.max}.`;
  return null;
}

export function renewBlock(
  i: { status: string; renewals: number; max: number; dueDate: Date },
  today: Date,
): string | null {
  if (i.status !== "ISSUED") return "Only books that are out can be renewed";
  if (i.renewals >= i.max)
    return i.max === 0
      ? "Renewals are not allowed"
      : `This book has already been renewed the most times allowed (${i.max})`;
  if (daysBetween(i.dueDate, today) > 0)
    return "This book is overdue. Return it first.";
  return null;
}
/** A renewal adds one loan period to the current due date. */
export const renewedDue = (due: Date, today: Date, loanDays: number) =>
  addDays(today > due ? today : due, loanDays);

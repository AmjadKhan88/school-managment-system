import { FeeFrequency, FineType, Prisma } from "@prisma/client";

export const ZERO = new Prisma.Decimal(0);
export const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface Line {
  categoryId: string;
  description: string;
  frequency: FeeFrequency;
  amount: Prisma.Decimal;
  discount: Prisma.Decimal;
}
export interface DiscountRule {
  mode: "PERCENT" | "FIXED";
  value: Prisma.Decimal;
  categoryId: string | null;
  validFromPeriod: string | null;
  validToPeriod: string | null;
}

/**
 * Applies approved discounts line by line. Scope: one category, or all MONTHLY lines when categoryId is null.
 * PERCENT is taken from each line's gross amount; FIXED is used up across matching lines in order.
 * A line's discount can never exceed its amount.
 */
export function applyDiscounts(
  lines: Line[],
  rules: DiscountRule[],
  periodKey: string,
): Line[] {
  const out = lines.map((l) => ({ ...l, discount: ZERO }));
  for (const r of rules) {
    if (r.validFromPeriod && periodKey < r.validFromPeriod) continue;
    if (r.validToPeriod && periodKey > r.validToPeriod) continue;
    const targets = out.filter((l) =>
      r.categoryId ? l.categoryId === r.categoryId : l.frequency === "MONTHLY",
    );
    let remaining: Prisma.Decimal | null = r.mode === "FIXED" ? r.value : null;
    for (const l of targets) {
      const room = l.amount.minus(l.discount);
      if (room.lte(0)) continue;
      let cut =
        r.mode === "PERCENT"
          ? l.amount.mul(r.value).div(100).toDecimalPlaces(2)
          : Prisma.Decimal.min(remaining!, room);
      cut = Prisma.Decimal.min(cut, room);
      l.discount = l.discount.plus(cut);
      if (remaining) {
        remaining = remaining.minus(cut);
        if (remaining.lte(0)) break;
      }
    }
  }
  return out;
}

const DAY_MS = 86_400_000;
const utcDay = (d: Date) =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Late fine owed as of a date. FIXED is charged once after the grace period; PER_DAY grows per day late. */
export function computeFine(
  rule: {
    fineType: FineType;
    fineRate: Prisma.Decimal;
    graceDays: number;
    dueDate: Date;
  },
  asOf: Date,
): Prisma.Decimal {
  if (rule.fineType === "NONE" || rule.fineRate.lte(0)) return ZERO;
  const lateFrom = utcDay(rule.dueDate) + rule.graceDays * DAY_MS;
  const daysLate = Math.floor((utcDay(asOf) - lateFrom) / DAY_MS);
  if (daysLate <= 0) return ZERO;
  return rule.fineType === "FIXED"
    ? rule.fineRate
    : rule.fineRate.mul(daysLate);
}

const parse = (periodKey: string) =>
  periodKey.split("-").map(Number) as [number, number];

export function periodDueDate(periodKey: string, dueDay: number): Date {
  const [y, m] = parse(periodKey);
  return new Date(Date.UTC(y, m - 1, dueDay));
}

export function periodOverlapsSession(
  periodKey: string,
  start: Date,
  end: Date,
): boolean {
  const [y, m] = parse(periodKey);
  const monthStart = Date.UTC(y, m - 1, 1);
  const monthEnd = Date.UTC(y, m, 0);
  return monthStart <= end.getTime() && monthEnd >= start.getTime();
}

export const sumDecimals = (xs: Prisma.Decimal[]) =>
  xs.reduce((s, x) => s.plus(x), ZERO);

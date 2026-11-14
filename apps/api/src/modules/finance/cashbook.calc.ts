import { Prisma } from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

export type EntryKind = "FEE" | "REVERSAL" | "REFUND" | "INCOME" | "EXPENSE";
export interface BookEntry {
  date: string;
  at: Date;
  kind: EntryKind;
  ref: string;
  method: string;
  description: string;
  amount: Prisma.Decimal; // positive = money in, negative = money out
}

/** Sorts entries by date and time, then adds a running balance starting from the opening balance. */
export function buildCashBook(entries: BookEntry[], opening: Prisma.Decimal) {
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.at.getTime() - b.at.getTime() ||
      a.ref.localeCompare(b.ref),
  );
  let balance = opening;
  let totalIn = ZERO;
  let totalOut = ZERO;
  const rows = sorted.map((e) => {
    balance = balance.plus(e.amount);
    if (e.amount.gte(0)) totalIn = totalIn.plus(e.amount);
    else totalOut = totalOut.plus(e.amount.neg());
    return {
      date: e.date,
      kind: e.kind,
      ref: e.ref,
      method: e.method,
      description: e.description,
      moneyIn: e.amount.gte(0) ? e.amount.toFixed(2) : null,
      moneyOut: e.amount.lt(0) ? e.amount.neg().toFixed(2) : null,
      balance: balance.toFixed(2),
    };
  });
  return {
    rows,
    totals: {
      opening: opening.toFixed(2),
      in: totalIn.toFixed(2),
      out: totalOut.toFixed(2),
      closing: balance.toFixed(2),
    },
  };
}

/** "2026-11" .. "2027-02" -> ["2026-11","2026-12","2027-01","2027-02"] */
export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  for (
    let y = fy, m = fm;
    y < ty || (y === ty && m <= tm);
    m === 12 ? (y++, (m = 1)) : m++
  ) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/** First and last day (UTC) covered by a month range. */
export function monthBounds(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return {
    from: new Date(Date.UTC(fy, fm - 1, 1)),
    to: new Date(Date.UTC(ty, tm, 0)),
  };
}

/** Default report range: the last 6 months including this one. */
export function defaultMonths(now = new Date()) {
  const to = now.toISOString().slice(0, 7);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  return { from: d.toISOString().slice(0, 7), to };
}

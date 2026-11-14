/** Turns sparse "month -> count" rows into one entry per month, with 0 for months that had none. */
export function fillMonths(
  rows: { month: string; n: number }[],
  months: string[],
) {
  const byMonth = new Map(rows.map((r) => [r.month, r.n]));
  return months.map((month) => ({ month, count: byMonth.get(month) ?? 0 }));
}

/** Percentage rounded to one decimal; 0 when there is nothing to divide by. */
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

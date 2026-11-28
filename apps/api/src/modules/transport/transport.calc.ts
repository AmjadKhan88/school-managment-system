const DAY = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) =>
  new Date(Date.parse(isoDay(d)) + n * DAY);

export function monthBounds(periodKey: string) {
  const [y, m] = periodKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 0)),
  };
}

/** Does a stay (end empty = still going) touch this month? */
export function overlapsMonth(
  a: { startDate: Date; endDate: Date | null },
  periodKey: string,
) {
  const { start, end } = monthBounds(periodKey);
  return (
    a.startDate.getTime() <= end.getTime() &&
    (!a.endDate || a.endDate.getTime() >= start.getTime())
  );
}

/** If a student changed route in the month, the newer stay is the one billed (the first on a tie). */
export function pickBilled<T extends { startDate: Date }>(
  stays: T[],
): T | null {
  return stays.reduce<T | null>(
    (best, s) =>
      !best || s.startDate.getTime() > best.startDate.getTime() ? s : best,
    null,
  );
}

export type ExpiryState = "EXPIRED" | "SOON" | "OK";
export function expiryState(
  date: Date | null,
  today: Date,
  warnDays = 30,
): ExpiryState | null {
  if (!date) return null;
  const days = Math.round(
    (Date.parse(isoDay(date)) - Date.parse(isoDay(today))) / DAY,
  );
  return days < 0 ? "EXPIRED" : days <= warnDays ? "SOON" : "OK";
}

export const seatsFree = (capacity: number, used: number) =>
  Math.max(0, capacity - used);

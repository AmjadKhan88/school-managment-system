import type { AttendanceStatus } from "@prisma/client";

export type Status = AttendanceStatus;
export interface Counts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
}

export const emptyCounts = (): Counts => ({
  present: 0,
  absent: 0,
  late: 0,
  leave: 0,
  halfDay: 0,
});

export function addStatus(c: Counts, s: Status, n = 1): Counts {
  if (s === "PRESENT") c.present += n;
  else if (s === "ABSENT") c.absent += n;
  else if (s === "LATE") c.late += n;
  else if (s === "LEAVE") c.leave += n;
  else c.halfDay += n;
  return c;
}

export const recorded = (c: Counts) =>
  c.present + c.absent + c.late + c.leave + c.halfDay;

/**
 * (Present + Late + half of Half-day) / (recorded days - Leave days). Leave is excused, so it is left out.
 * Returns null when there is nothing to measure.
 */
export function attendancePercent(c: Counts): number | null {
  const counted = c.present + c.absent + c.late + c.halfDay;
  if (counted === 0) return null;
  return (
    Math.round(((c.present + c.late + 0.5 * c.halfDay) / counted) * 1000) / 10
  );
}

export const LETTER: Record<Status, string> = {
  PRESENT: "P",
  ABSENT: "A",
  LATE: "L",
  LEAVE: "V",
  HALF_DAY: "H",
};

/** True when the date is within `days` days before today. Used to lock old registers. */
export const withinEditWindow = (date: Date, today: Date, days = 7) =>
  (today.getTime() - date.getTime()) / 86_400_000 <= days;

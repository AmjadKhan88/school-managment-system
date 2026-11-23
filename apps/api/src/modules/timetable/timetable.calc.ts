import { TIME_RE, timesOverlap } from "../exams/exams.calc";

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];
const DAY = 86_400_000;

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** ISO weekday: Monday = 1 ... Sunday = 7. Dates are UTC midnights. */
export const weekdayOf = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
export const mondayOf = (d: Date) =>
  new Date(d.getTime() - (weekdayOf(d) - 1) * DAY);
export const dateOfDay = (monday: Date, day: number) =>
  new Date(monday.getTime() + (day - 1) * DAY);

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += DAY
  )
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export interface PeriodTimes {
  id?: string;
  startTime: string;
  endTime: string;
}
/** A message when the period is not valid against the others in the same session, otherwise null. */
export function validatePeriod(
  c: PeriodTimes,
  others: PeriodTimes[],
): string | null {
  if (!TIME_RE.test(c.startTime) || !TIME_RE.test(c.endTime))
    return "Use the format HH:MM";
  if (c.endTime <= c.startTime)
    return "The end time must be after the start time";
  const clash = others.find(
    (o) =>
      o.id !== c.id &&
      timesOverlap(c.startTime, c.endTime, o.startTime, o.endTime),
  );
  return clash
    ? `This overlaps another period (${clash.startTime} to ${clash.endTime})`
    : null;
}

export interface OtherEntry {
  sectionId: string;
  employeeId: string | null;
  roomId: string | null;
  label: string;
}
/** Clashes of a new entry with what already sits in the same weekday and period. The section's own slot is being replaced, so it is ignored. */
export function slotConflicts(
  c: { sectionId: string; employeeId: string | null; roomId: string | null },
  others: OtherEntry[],
  names: { teacher?: string; room?: string },
): string[] {
  const out: string[] = [];
  for (const o of others) {
    if (o.sectionId === c.sectionId) continue;
    if (c.employeeId && o.employeeId === c.employeeId)
      out.push(
        `${names.teacher ?? "This teacher"} is already teaching ${o.label} in this period`,
      );
    if (c.roomId && o.roomId === c.roomId)
      out.push(
        `${names.room ?? "This room"} is already used by ${o.label} in this period`,
      );
  }
  return out;
}

export interface LeaveSpan {
  employeeId: string;
  start: string;
  end: string;
  applicationNo: string;
  type: string;
}
/** The approved leave that covers an employee on a date (ISO text compares correctly). */
export const leaveOn = (spans: LeaveSpan[], employeeId: string, date: string) =>
  spans.find(
    (s) => s.employeeId === employeeId && s.start <= date && date <= s.end,
  ) ?? null;

/** Calendar days from start to end, both included. */
export const leaveDays = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

/** True when two date ranges share at least one day. */
export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart <= bEnd && aEnd >= bStart;

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  SICK: "Sick leave",
  CASUAL: "Casual leave",
  ANNUAL: "Annual leave",
  EMERGENCY: "Emergency",
  FAMILY: "Family event",
  MATERNITY: "Maternity leave",
  UNPAID: "Unpaid leave",
  OTHER: "Other",
};

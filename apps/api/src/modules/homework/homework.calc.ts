const day = (d: Date) => d.toISOString().slice(0, 10);

/** Late means handed in after the due date (dates only, no time of day). */
export const isLate = (due: Date, at: Date) => day(at) > day(due);

export type Track =
  | "PENDING"
  | "OVERDUE"
  | "SUBMITTED"
  | "LATE"
  | "CHECKED"
  | "REDO";
export interface SubLike {
  status: "SUBMITTED" | "CHECKED" | "REDO";
  late: boolean;
}

/** How a student's work looks to the teacher. */
export function trackOf(sub: SubLike | null, due: Date, today: Date): Track {
  if (!sub) return isLate(due, today) ? "OVERDUE" : "PENDING";
  if (sub.status === "CHECKED") return "CHECKED";
  if (sub.status === "REDO") return "REDO";
  return sub.late ? "LATE" : "SUBMITTED";
}

/** Done means handed in and not sent back: submitted, late or checked. */
export function summarise(tracks: Track[]) {
  const c = {
    total: tracks.length,
    pending: 0,
    overdue: 0,
    submitted: 0,
    late: 0,
    checked: 0,
    redo: 0,
  };
  tracks.forEach((t) => {
    if (t === "PENDING") c.pending++;
    else if (t === "OVERDUE") c.overdue++;
    else if (t === "SUBMITTED") c.submitted++;
    else if (t === "LATE") c.late++;
    else if (t === "CHECKED") c.checked++;
    else c.redo++;
  });
  const done = c.submitted + c.late + c.checked;
  return {
    ...c,
    done,
    percent: c.total ? Math.round((done / c.total) * 100) : 0,
  };
}

/** A reason when a student or parent may not submit right now, otherwise null. */
export function canSubmit(
  hw: { status: string; dueDate: Date; allowLate: boolean },
  sub: { status: string } | null,
  today: Date,
): string | null {
  if (hw.status !== "ACTIVE") return "This homework was cancelled";
  if (sub?.status === "CHECKED")
    return "Your teacher has already checked this homework";
  if (!hw.allowLate && isLate(hw.dueDate, today))
    return "The deadline has passed and late work is not accepted";
  return null;
}

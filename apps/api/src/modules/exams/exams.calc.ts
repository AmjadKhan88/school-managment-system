export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Two time ranges overlap when each starts before the other ends. Touching ends do not overlap. */
export const timesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);

export interface Slot {
  classId: string;
  label: string;
  date: string;
  start: string;
  end: string;
  room: string | null;
  touched: boolean;
}

/**
 * Same class overlapping on a day, or the same room overlapping on a day.
 * Only pairs that involve a paper being saved ("touched") are reported, so old clashes elsewhere do not block you.
 */
export function findConflicts(slots: Slot[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i],
        b = slots[j];
      if (
        !(a.touched || b.touched) ||
        a.date !== b.date ||
        !timesOverlap(a.start, a.end, b.start, b.end)
      )
        continue;
      if (a.classId === b.classId)
        out.add(`${a.label} and ${b.label} overlap on ${a.date} (same class)`);
      const ra = a.room?.trim().toLowerCase();
      const rb = b.room?.trim().toLowerCase();
      if (ra && ra === rb)
        out.add(
          `Room "${a.room!.trim()}" is booked for ${a.label} and ${b.label} on ${a.date}`,
        );
    }
  }
  return [...out];
}

export type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY";

export const STATUS_ORDER: Status[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "LEAVE",
  "HALF_DAY",
];

export const STATUS_META: Record<
  Status,
  { label: string; letter: string; active: string }
> = {
  PRESENT: {
    label: "Present",
    letter: "P",
    active: "border-emerald-600 bg-emerald-600 text-white",
  },
  ABSENT: {
    label: "Absent",
    letter: "A",
    active: "border-rose-600 bg-rose-600 text-white",
  },
  LATE: {
    label: "Late",
    letter: "L",
    active: "border-amber-500 bg-amber-500 text-white",
  },
  LEAVE: {
    label: "Leave",
    letter: "V",
    active: "border-sky-600 bg-sky-600 text-white",
  },
  HALF_DAY: {
    label: "Half day",
    letter: "H",
    active: "border-violet-600 bg-violet-600 text-white",
  },
};

/** Cell colours for the one-letter codes in reports. */
export const LETTER_STYLE: Record<string, string> = {
  P: "bg-emerald-100 text-emerald-700",
  A: "bg-rose-100 text-rose-700",
  L: "bg-amber-100 text-amber-700",
  V: "bg-sky-100 text-sky-700",
  H: "bg-violet-100 text-violet-700",
};

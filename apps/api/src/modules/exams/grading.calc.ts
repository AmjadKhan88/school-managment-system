export interface Band {
  grade: string;
  minPercent: number;
  gradePoint: number;
  remark?: string | null;
}

/** Returns a list of problems. An empty list means the scale is valid. */
export function validateBands(bands: Band[]): string[] {
  const errors: string[] = [];
  if (bands.length === 0) return ["Add at least one grade"];
  const grades = bands.map((b) => b.grade.trim().toLowerCase());
  if (grades.some((g) => !g)) errors.push("Every grade needs a name");
  if (new Set(grades).size !== grades.length)
    errors.push("Two grades have the same name");
  const mins = bands.map((b) => Math.round(b.minPercent * 100));
  if (new Set(mins).size !== mins.length)
    errors.push("Two grades start at the same percentage");
  if (bands.some((b) => b.minPercent < 0 || b.minPercent > 100))
    errors.push("Percentages must be between 0 and 100");
  if (!bands.some((b) => b.minPercent === 0))
    errors.push(
      "The lowest grade must start at 0%, so every score gets a grade",
    );
  if (bands.some((b) => b.gradePoint < 0 || b.gradePoint > 10))
    errors.push("Grade points must be between 0 and 10");
  return errors;
}

/** The grade a percentage earns: the band with the highest minimum that is not above it. */
export function resolveBand<T extends Band>(
  bands: T[],
  percent: number,
): T | null {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percent >= b.minPercent) ?? null;
}

/** Display ranges: each grade runs to just below the next higher grade (the top grade to 100). */
export function bandRanges<T extends Band>(bands: T[]) {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.map((b, i) => ({
    ...b,
    from: b.minPercent,
    to:
      i === 0 ? 100 : Math.round((sorted[i - 1].minPercent - 0.01) * 100) / 100,
  }));
}

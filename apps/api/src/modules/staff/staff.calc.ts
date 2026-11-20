import { randomInt } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";

/** A random 12-character temporary password with an uppercase letter, a lowercase letter and a digit. Avoids look-alike characters. */
export function tempPassword(): string {
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGIT),
    ...Array.from({ length: 9 }, () => pick(UPPER + LOWER + DIGIT)),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export interface Change {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

/** The fields whose value differs, ready to be written to the employment history. */
export function diffFields(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): Change[] {
  return Object.keys(after)
    .filter((k) => (before[k] ?? null) !== (after[k] ?? null))
    .map((k) => ({
      field: k,
      oldValue: before[k] ?? null,
      newValue: after[k] ?? null,
    }));
}

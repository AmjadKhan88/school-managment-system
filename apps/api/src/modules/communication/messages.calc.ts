/**
 * Turns a phone number into international digits for WhatsApp and SMS.
 * 0300 1234567 and 300 1234567 become 923001234567. Returns null when it cannot be a real number.
 */
export function toDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let n = phone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = `92${n.slice(1)}`;
  else if (n.length === 10 && n.startsWith("3")) n = `92${n}`;
  return n.length >= 11 && n.length <= 15 ? n : null;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Every {variable} in the text, in the order it appears. */
export const extractVars = (body: string) =>
  [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** Replaces each {variable}. An unknown one is left exactly as typed. */
export const render = (body: string, vars: Record<string, string>) =>
  body.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);

export const joinNames = (n: string[]) =>
  n.length <= 1
    ? (n[0] ?? "")
    : n.length === 2
      ? `${n[0]} and ${n[1]}`
      : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;

export const waLink = (digits: string, text: string) =>
  `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

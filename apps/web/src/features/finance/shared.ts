import { fmtMoney } from "@/features/fees/shared";

export const SOURCE_LABEL: Record<string, string> = {
  DONATION: "Donation",
  TRANSPORT: "Transport income",
  RENTAL: "Rental income",
  EVENT: "Events and fundraising",
  OTHER: "Other income",
};

export const signedMoney = (v: string | number) =>
  Number(v) < 0 ? `-${fmtMoney(Math.abs(Number(v)))}` : fmtMoney(v);

export const monthLabel = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};
export const firstOfThisMonth = () => `${localToday().slice(0, 8)}01`;
export const thisMonth = () => localToday().slice(0, 7);
export const monthsAgo = (n: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

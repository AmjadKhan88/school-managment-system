export type Frequency = "MONTHLY" | "ONE_TIME" | "YEARLY";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  MONTHLY: "Monthly",
  ONE_TIME: "One-time",
  YEARLY: "Yearly",
};

/** "Rs 12,500". The currency symbol becomes a school setting later. */
export const fmtMoney = (v: string | number | null | undefined) =>
  `Rs ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export type Method =
  | "CASH"
  | "BANK_TRANSFER"
  | "JAZZCASH"
  | "EASYPAISA"
  | "CHEQUE"
  | "OTHER";

export const METHOD_LABEL: Record<Method, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "EasyPaisa",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

/** Methods that need a transaction or cheque reference. */
export const NEEDS_REFERENCE: Method[] = [
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CHEQUE",
];

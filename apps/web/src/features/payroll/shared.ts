export const money = (v: string | number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export const PAY_METHODS: [string, string][] = [
  ["CASH", "Cash"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["JAZZCASH", "JazzCash"],
  ["EASYPAISA", "EasyPaisa"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"],
];
export const METHOD_LABEL: Record<string, string> =
  Object.fromEntries(PAY_METHODS);
export const monthName = (p: string) =>
  new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

export interface RunRow {
  id: string;
  slipNo: string;
  status: "DRAFT" | "APPROVED";
  employee: {
    id: string;
    employeeNo: string;
    fullName: string;
    designation: string;
    department: string | null;
    bankName: string | null;
    accountLast4: string | null;
  };
  basic: string;
  allowances: string;
  bonus: string;
  overtime: string;
  deductions: string;
  loanRecovery: string;
  absenceDeduction: string;
  net: string;
  paid: string;
  balance: string;
  absenceDays: number;
  absenceOverridden: boolean;
  recordedDays: number;
}
export interface RunsData {
  period: string;
  summary: {
    employees: number;
    drafts: number;
    approved: number;
    net: string;
    paid: string;
    balance: string;
  };
  items: RunRow[];
}

import { Prisma } from "@prisma/client";

type Dec = Prisma.Decimal;
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const ZERO = D(0);
const r2 = (d: Dec) => d.toDecimalPlaces(2);

/** Payroll month basis for daily and hourly rates. */
export const DAYS_BASIS = 30;
export const HOURS_PER_DAY = 8;

export interface ComponentInput {
  label: string;
  type: "ALLOWANCE" | "DEDUCTION";
  isPercent: boolean;
  value: Dec;
}

export const componentAmount = (basic: Dec, c: ComponentInput): Dec =>
  r2(c.isPercent ? basic.mul(c.value).div(100) : c.value);
export const defaultOvertimeRate = (basic: Dec): Dec =>
  r2(basic.div(DAYS_BASIS).div(HOURS_PER_DAY));
/** Daily rate times the days absent, never more than the whole basic salary. */
export const absenceDeductionFor = (basic: Dec, days: Dec): Dec =>
  Prisma.Decimal.min(r2(basic.div(DAYS_BASIS).mul(days)), basic);

export interface LoanDue {
  loanId: string;
  label: string;
  due: Dec;
}
export type LineKind =
  | "BASIC"
  | "ALLOWANCE"
  | "BONUS"
  | "OVERTIME"
  | "DEDUCTION"
  | "LOAN"
  | "ABSENCE";
export interface PayLine {
  kind: LineKind;
  label: string;
  amount: Dec;
  loanId?: string;
}
export interface PayInput {
  basic: Dec;
  components: ComponentInput[];
  bonus: Dec;
  overtimeHours: Dec;
  overtimeRate: Dec;
  absenceDays: Dec;
  loans: LoanDue[];
}
export interface PayResult {
  lines: PayLine[];
  allowancesTotal: Dec;
  bonus: Dec;
  overtimeAmount: Dec;
  deductionsTotal: Dec;
  absenceDeduction: Dec;
  loanRecovery: Dec;
  postponed: Dec;
  netSalary: Dec;
  negative: boolean;
}

/**
 * Net Salary = Basic + Allowances + Bonus + Overtime - Deductions - Absence deduction - Loan recoveries.
 * A loan instalment is cut back to what the salary can cover; the rest stays owing (postponed).
 */
export function computePay(i: PayInput): PayResult {
  const lines: PayLine[] = [
    { kind: "BASIC", label: "Basic salary", amount: r2(i.basic) },
  ];

  let allowancesTotal = ZERO;
  for (const c of i.components.filter((x) => x.type === "ALLOWANCE")) {
    const amount = componentAmount(i.basic, c);
    if (amount.gt(0)) {
      allowancesTotal = allowancesTotal.plus(amount);
      lines.push({ kind: "ALLOWANCE", label: c.label, amount });
    }
  }
  const bonus = r2(i.bonus);
  if (bonus.gt(0)) lines.push({ kind: "BONUS", label: "Bonus", amount: bonus });
  const overtimeAmount = r2(i.overtimeHours.mul(i.overtimeRate));
  if (overtimeAmount.gt(0))
    lines.push({
      kind: "OVERTIME",
      label: `Overtime (${i.overtimeHours.toString()} h)`,
      amount: overtimeAmount,
    });

  let deductionsTotal = ZERO;
  for (const c of i.components.filter((x) => x.type === "DEDUCTION")) {
    const amount = componentAmount(i.basic, c);
    if (amount.gt(0)) {
      deductionsTotal = deductionsTotal.plus(amount);
      lines.push({ kind: "DEDUCTION", label: c.label, amount });
    }
  }
  const absenceDeduction = absenceDeductionFor(i.basic, i.absenceDays);
  if (absenceDeduction.gt(0))
    lines.push({
      kind: "ABSENCE",
      label: `Absence (${i.absenceDays.toString()} day${i.absenceDays.eq(1) ? "" : "s"})`,
      amount: absenceDeduction,
    });

  const earnings = r2(i.basic)
    .plus(allowancesTotal)
    .plus(bonus)
    .plus(overtimeAmount);
  const before = earnings.minus(deductionsTotal).minus(absenceDeduction);

  let available = Prisma.Decimal.max(before, ZERO);
  let loanRecovery = ZERO;
  let postponed = ZERO;
  for (const l of i.loans) {
    const amount = Prisma.Decimal.min(l.due, available);
    if (amount.gt(0)) {
      lines.push({ kind: "LOAN", label: l.label, amount, loanId: l.loanId });
      loanRecovery = loanRecovery.plus(amount);
      available = available.minus(amount);
    }
    postponed = postponed.plus(l.due.minus(amount));
  }

  return {
    lines,
    allowancesTotal,
    bonus,
    overtimeAmount,
    deductionsTotal,
    absenceDeduction,
    loanRecovery,
    postponed,
    netSalary: before.minus(loanRecovery),
    negative: before.lt(0),
  };
}

// ---------------- Attendance into absence days ----------------
export interface AttRecord {
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY";
}
export interface LeaveSpan {
  start: string;
  end: string;
  type: string;
}

/** Dates are ISO strings (YYYY-MM-DD), so they compare correctly as text. */
export function summariseAttendance(records: AttRecord[], leaves: LeaveSpan[]) {
  const out = {
    present: 0,
    halfDays: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    uncoveredLeave: 0,
    recorded: records.length,
  };
  for (const r of records) {
    if (r.status === "PRESENT" || r.status === "LATE") out.present++;
    else if (r.status === "HALF_DAY") out.halfDays++;
    else if (r.status === "ABSENT") out.absent++;
    else {
      const cover = leaves.filter((l) => l.start <= r.date && r.date <= l.end);
      if (cover.length === 0) out.uncoveredLeave++;
      else if (cover.some((l) => l.type === "UNPAID")) out.unpaidLeave++;
      else out.paidLeave++;
    }
  }
  return out;
}

/** Days of the month before the employee joined or after they left. */
export function outsideDays(
  periodStart: string,
  periodEnd: string,
  joining: string,
  leaving: string | null,
): number {
  const day = 86_400_000;
  const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const total = (t(periodEnd) - t(periodStart)) / day + 1;
  let out = 0;
  if (joining > periodStart)
    out += Math.min(total, (t(joining) - t(periodStart)) / day);
  if (leaving && leaving < periodEnd) out += (t(periodEnd) - t(leaving)) / day;
  return Math.min(total, out);
}

export const computedAbsence = (
  s: ReturnType<typeof summariseAttendance>,
  outside: number,
): Dec =>
  D(s.absent)
    .plus(D(s.halfDays).mul(0.5))
    .plus(s.unpaidLeave)
    .plus(s.uncoveredLeave)
    .plus(outside);

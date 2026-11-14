import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { formatNumber } from "../../utils/sequence";
import { ZERO } from "../fees/invoices.calc";
import { BookEntry, monthBounds, monthsBetween } from "./cashbook.calc";

export type Account = "ALL" | "CASH" | "NON_CASH";

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "EasyPaisa",
  CHEQUE: "Cheque",
  OTHER: "Other",
};
export const SOURCE_LABEL: Record<string, string> = {
  DONATION: "Donation",
  TRANSPORT: "Transport income",
  RENTAL: "Rental income",
  EVENT: "Events and fundraising",
  OTHER: "Other income",
};

/** Next gapless reference such as EXP-2026-00001. Call inside the transaction that saves the record. */
export async function nextNo(
  tx: Prisma.TransactionClient,
  prefix: string,
  date: Date,
) {
  const year = date.getUTCFullYear();
  const key = `${prefix}-${year}`;
  const c = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatNumber(prefix, year, c.value, 5);
}

type MethodFilter = { method?: PaymentMethod | { not: PaymentMethod } };
const methodWhere = (a: Account): MethodFilter =>
  a === "CASH"
    ? { method: "CASH" }
    : a === "NON_CASH"
      ? { method: { not: "CASH" } }
      : {};

const LIMIT = 5000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const z0 = (d: Prisma.Decimal | null | undefined) => d ?? ZERO;

/** Every money movement in the range, plus the balance carried in from before it. */
export async function loadCashBook(from: Date, to: Date, account: Account) {
  const mw = methodWhere(account);
  const inAccount = (m: string) =>
    account === "ALL" || (account === "CASH" ? m === "CASH" : m !== "CASH");
  const range = { gte: from, lte: to };

  const [
    payments,
    refunds,
    income,
    expenses,
    oLines,
    oRefunds,
    oIncome,
    oExpenses,
  ] = await Promise.all([
    prisma.feePayment.findMany({
      where: {
        paymentDate: range,
        ...(account !== "ALL" && { lines: { some: mw } }),
      },
      include: {
        lines: true,
        student: { select: { fullName: true, admissionNo: true } },
      },
      take: LIMIT,
    }),
    prisma.feeRefund.findMany({
      where: { status: "PAID", paidDate: range, ...mw },
      include: { student: { select: { fullName: true } } },
      take: LIMIT,
    }),
    prisma.otherIncome.findMany({
      where: { status: "ACTIVE", incomeDate: range, ...mw },
      take: LIMIT,
    }),
    prisma.expense.findMany({
      where: { status: "APPROVED", expenseDate: range, ...mw },
      include: { category: { select: { name: true } } },
      take: LIMIT,
    }),
    prisma.feePaymentLine.aggregate({
      where: { payment: { paymentDate: { lt: from } }, ...mw },
      _sum: { amount: true },
    }),
    prisma.feeRefund.aggregate({
      where: { status: "PAID", paidDate: { lt: from }, ...mw },
      _sum: { amount: true },
    }),
    prisma.otherIncome.aggregate({
      where: { status: "ACTIVE", incomeDate: { lt: from }, ...mw },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { status: "APPROVED", expenseDate: { lt: from }, ...mw },
      _sum: { amount: true },
    }),
  ]);

  const entries: BookEntry[] = [];
  for (const p of payments) {
    for (const l of p.lines) {
      if (!inAccount(l.method)) continue;
      entries.push({
        date: iso(p.paymentDate),
        at: p.createdAt,
        kind: p.kind === "REVERSAL" ? "REVERSAL" : "FEE",
        ref: p.receiptNo,
        method: l.method,
        description: `${p.kind === "REVERSAL" ? "Payment reversal" : "Fee receipt"}: ${p.student.fullName} (${p.student.admissionNo})`,
        amount: l.amount,
      });
    }
  }
  for (const r of refunds) {
    entries.push({
      date: iso(r.paidDate!),
      at: r.decidedAt ?? r.createdAt,
      kind: "REFUND",
      ref: r.refundNo,
      method: r.method,
      description: `Fee refund: ${r.student.fullName}`,
      amount: r.amount.neg(),
    });
  }
  for (const i of income) {
    entries.push({
      date: iso(i.incomeDate),
      at: i.createdAt,
      kind: "INCOME",
      ref: i.incomeNo,
      method: i.method,
      description: `${SOURCE_LABEL[i.source]}: ${i.description}${i.receivedFrom ? ` (${i.receivedFrom})` : ""}`,
      amount: i.amount,
    });
  }
  for (const e of expenses) {
    entries.push({
      date: iso(e.expenseDate),
      at: e.approvedAt ?? e.createdAt,
      kind: "EXPENSE",
      ref: e.expenseNo,
      method: e.method,
      description: `${e.category.name}: ${e.description}${e.paidTo ? ` (${e.paidTo})` : ""}`,
      amount: e.amount.neg(),
    });
  }

  const opening = z0(oLines._sum.amount)
    .plus(z0(oIncome._sum.amount))
    .minus(z0(oRefunds._sum.amount))
    .minus(z0(oExpenses._sum.amount));
  return {
    entries,
    opening,
    truncated: [payments, refunds, income, expenses].some(
      (a) => a.length >= LIMIT,
    ),
  };
}

const sumsByMonth = async (q: Prisma.Sql) =>
  new Map(
    (await prisma.$queryRaw<{ month: string; amount: string }[]>(q)).map(
      (r) => [r.month, new Prisma.Decimal(r.amount)],
    ),
  );

/** Income and expense per month. Income = fee collections - refunds + other income. */
export async function monthlyFinance(fromMonth: string, toMonth: string) {
  const { from, to } = monthBounds(fromMonth, toMonth);
  const [fees, refunds, other, spent] = await Promise.all([
    sumsByMonth(Prisma.sql`SELECT to_char(p."paymentDate", 'YYYY-MM') AS month, SUM(l.amount)::text AS amount
      FROM fee_payments p JOIN fee_payment_lines l ON l."paymentId" = p.id
      WHERE p."paymentDate" BETWEEN ${from} AND ${to} GROUP BY 1`),
    sumsByMonth(Prisma.sql`SELECT to_char(r."paidDate", 'YYYY-MM') AS month, SUM(r.amount)::text AS amount
      FROM fee_refunds r WHERE r.status = 'PAID' AND r."paidDate" BETWEEN ${from} AND ${to} GROUP BY 1`),
    sumsByMonth(Prisma.sql`SELECT to_char(i."incomeDate", 'YYYY-MM') AS month, SUM(i.amount)::text AS amount
      FROM other_income i WHERE i.status = 'ACTIVE' AND i."incomeDate" BETWEEN ${from} AND ${to} GROUP BY 1`),
    sumsByMonth(Prisma.sql`SELECT to_char(e."expenseDate", 'YYYY-MM') AS month, SUM(e.amount)::text AS amount
      FROM expenses e WHERE e.status = 'APPROVED' AND e."expenseDate" BETWEEN ${from} AND ${to} GROUP BY 1`),
  ]);

  const rows = monthsBetween(fromMonth, toMonth).map((month) => {
    const f = fees.get(month) ?? ZERO,
      r = refunds.get(month) ?? ZERO,
      o = other.get(month) ?? ZERO,
      e = spent.get(month) ?? ZERO;
    const income = f.minus(r).plus(o);
    return {
      month,
      fees: f,
      refunds: r,
      otherIncome: o,
      income,
      expenses: e,
      net: income.minus(e),
    };
  });
  const sum = (
    k: "fees" | "refunds" | "otherIncome" | "income" | "expenses" | "net",
  ) => rows.reduce((s, r) => s.plus(r[k]), ZERO);
  const fmt = (r: (typeof rows)[number]) => ({
    month: r.month,
    fees: r.fees.toFixed(2),
    refunds: r.refunds.toFixed(2),
    otherIncome: r.otherIncome.toFixed(2),
    income: r.income.toFixed(2),
    expenses: r.expenses.toFixed(2),
    net: r.net.toFixed(2),
  });
  return {
    rows: rows.map(fmt),
    totals: {
      fees: sum("fees").toFixed(2),
      refunds: sum("refunds").toFixed(2),
      otherIncome: sum("otherIncome").toFixed(2),
      income: sum("income").toFixed(2),
      expenses: sum("expenses").toFixed(2),
      net: sum("net").toFixed(2),
    },
  };
}

/** Approved expenses grouped by category and by month. */
export async function expenseSummary(fromMonth: string, toMonth: string) {
  const { from, to } = monthBounds(fromMonth, toMonth);
  const where: Prisma.ExpenseWhereInput = {
    status: "APPROVED",
    expenseDate: { gte: from, lte: to },
  };
  const [groups, byMonth] = await Promise.all([
    prisma.expense.groupBy({
      by: ["categoryId"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    sumsByMonth(Prisma.sql`SELECT to_char(e."expenseDate", 'YYYY-MM') AS month, SUM(e.amount)::text AS amount
      FROM expenses e WHERE e.status = 'APPROVED' AND e."expenseDate" BETWEEN ${from} AND ${to} GROUP BY 1`),
  ]);
  const cats = await prisma.expenseCategory.findMany({
    where: { id: { in: groups.map((g) => g.categoryId) } },
    select: { id: true, name: true },
  });
  const name = new Map(cats.map((c) => [c.id, c.name]));

  const total = groups.reduce((s, g) => s.plus(z0(g._sum.amount)), ZERO);
  return {
    total: total.toFixed(2),
    byCategory: groups
      .map((g) => ({
        category: name.get(g.categoryId) ?? "—",
        count: g._count._all,
        amount: z0(g._sum.amount).toFixed(2),
        share: total.gt(0)
          ? z0(g._sum.amount).div(total).mul(100).toDecimalPlaces(1).toNumber()
          : 0,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
    byMonth: monthsBetween(fromMonth, toMonth).map((month) => ({
      month,
      amount: (byMonth.get(month) ?? ZERO).toFixed(2),
    })),
  };
}

import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { nextNo } from "../finance/finance.service";
import {
  countInconsistencies,
  loanExpenseText,
  salaryExpenseText,
} from "./posting.calc";

type Tx = Prisma.TransactionClient;
export const SALARY_CATEGORY = "Salaries";
export const LOAN_CATEGORY = "Staff advances and loans";

async function categoryId(tx: Tx, name: string) {
  const found = await tx.expenseCategory.findFirst({
    where: { name },
    select: { id: true },
  });
  if (found) return found.id;
  return (
    await tx.expenseCategory.create({
      data: { name, sortOrder: 90 },
      select: { id: true },
    })
  ).id;
}

interface Posting {
  category: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  method: PaymentMethod;
  paidTo: string;
  reference: string | null;
  byUserId: string;
}

/** Writes an approved expense. Call it inside the same transaction as the payment it belongs to. */
export async function postExpense(tx: Tx, d: Posting) {
  return tx.expense.create({
    data: {
      expenseNo: await nextNo(tx, "EXP", d.date),
      categoryId: await categoryId(tx, d.category),
      description: d.description,
      amount: d.amount,
      expenseDate: d.date,
      method: d.method,
      paidTo: d.paidTo,
      reference: d.reference,
      status: "APPROVED",
      createdById: d.byUserId,
      approvedById: d.byUserId,
      approvedAt: new Date(),
    },
    select: { id: true, expenseNo: true },
  });
}

/** Voiding keeps the record and removes it from the books, exactly like voiding an expense by hand. */
export async function voidExpense(tx: Tx, expenseId: string, reason: string) {
  await tx.expense.updateMany({
    where: { id: expenseId, status: "APPROVED" },
    data: { status: "VOIDED", voidReason: reason, voidedAt: new Date() },
  });
}

// ---------------- Earlier records and the consistency check ----------------
class Skip extends Error {}

export async function financeStatus() {
  const [livePayments, loans, linked] = await Promise.all([
    prisma.salaryPayment.findMany({
      where: { reversedAt: null, expenseId: null },
      select: { amount: true },
    }),
    prisma.staffLoan.findMany({
      where: {
        status: { in: ["ACTIVE", "SETTLED"] },
        issuedOn: { not: null },
        payoutExpenseId: null,
      },
      select: { amount: true },
    }),
    prisma.salaryPayment.findMany({
      where: { expenseId: { not: null } },
      select: {
        reversedAt: true,
        amount: true,
        expense: { select: { status: true, amount: true } },
      },
    }),
  ]);
  const amount = [...livePayments, ...loans].reduce(
    (t, x) => t.plus(x.amount),
    new Prisma.Decimal(0),
  );
  return {
    unposted: {
      payments: livePayments.length,
      loans: loans.length,
      amount: amount.toFixed(2),
    },
    inconsistencies: countInconsistencies(
      linked.map((l) => ({
        reversed: !!l.reversedAt,
        amount: l.amount,
        expense: l.expense,
      })),
    ),
  };
}

/** Posts payments and loan payouts that were recorded before posting existed. Safe to run more than once. */
export async function backfillPosting(userId: string) {
  let payments = 0,
    loans = 0,
    skipped = 0;

  const pays = await prisma.salaryPayment.findMany({
    where: { reversedAt: null, expenseId: null },
    orderBy: { createdAt: "asc" },
    include: {
      payroll: { select: { period: true, slipNo: true } },
      employee: { select: { fullName: true } },
    },
  });
  for (const p of pays) {
    try {
      await prisma.$transaction(async (tx) => {
        const exp = await postExpense(tx, {
          category: SALARY_CATEGORY,
          description: salaryExpenseText(
            p.payroll.period,
            p.payroll.slipNo,
            p.receiptNo,
          ),
          amount: p.amount,
          date: p.paidOn,
          method: p.method,
          paidTo: p.employee.fullName,
          reference: p.reference ?? p.receiptNo,
          byUserId: userId,
        });
        const r = await tx.salaryPayment.updateMany({
          where: { id: p.id, expenseId: null, reversedAt: null },
          data: { expenseId: exp.id },
        });
        if (r.count === 0) throw new Skip(); // someone else posted or reversed it meanwhile; roll the new expense back
      });
      payments++;
    } catch (e) {
      if (e instanceof Skip) skipped++;
      else throw e;
    }
  }

  const ls = await prisma.staffLoan.findMany({
    where: {
      status: { in: ["ACTIVE", "SETTLED"] },
      issuedOn: { not: null },
      payoutExpenseId: null,
    },
    orderBy: { createdAt: "asc" },
    include: { employee: { select: { fullName: true } } },
  });
  for (const l of ls) {
    try {
      await prisma.$transaction(async (tx) => {
        const exp = await postExpense(tx, {
          category: LOAN_CATEGORY,
          description: loanExpenseText(l.type, l.loanNo),
          amount: l.amount,
          date: l.issuedOn!,
          method: l.issueMethod ?? "CASH",
          paidTo: l.employee.fullName,
          reference: l.issueReference ?? l.loanNo,
          byUserId: userId,
        });
        const r = await tx.staffLoan.updateMany({
          where: { id: l.id, payoutExpenseId: null },
          data: { payoutExpenseId: exp.id },
        });
        if (r.count === 0) throw new Skip();
      });
      loans++;
    } catch (e) {
      if (e instanceof Skip) skipped++;
      else throw e;
    }
  }
  return { payments, loans, skipped };
}

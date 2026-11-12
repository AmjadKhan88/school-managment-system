import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { formatNumber } from "../../utils/sequence";
import { computeFine, sumDecimals, ZERO } from "./invoices.calc";
import { allocate, invoiceStatusFor } from "./payments.calc";
import type { CollectInput } from "./payments.schema";

type Tx = Prisma.TransactionClient;
const OPTS = { timeout: 30_000, maxWait: 10_000 };
const OPEN = ["OPEN", "PARTIAL"] as const;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const balanceOf = (i: {
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}) => i.totalAmount.minus(i.paidAmount);

/** Row locks, taken in id order so two payments can never deadlock or both spend the same balance. */
async function lock(
  tx: Tx,
  table: "fee_invoices" | "fee_payments",
  ids: string[],
) {
  if (ids.length === 0) return;
  if (table === "fee_invoices")
    await tx.$queryRaw`SELECT id FROM fee_invoices WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  else
    await tx.$queryRaw`SELECT id FROM fee_payments WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

async function nextNumber(tx: Tx, prefix: "RCP" | "REV", date: Date) {
  const year = date.getUTCFullYear();
  const key = `${prefix}-${year}`;
  const c = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatNumber(prefix, year, c.value, 5);
}

// ====================================================================
export async function collectPayment(input: CollectInput, userId: string) {
  const existing = async () =>
    input.idempotencyKey
      ? prisma.feePayment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, receiptNo: true },
        })
      : null;

  const again = await existing();
  if (again) return { ...again, duplicate: true };

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound("Student not found");

  const received = sumDecimals(
    input.methods.map((m) => new Prisma.Decimal(m.amount)),
  );
  const selected = input.invoiceIds?.length ? input.invoiceIds : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const wanted = await tx.feeInvoice.findMany({
        where: {
          studentId: input.studentId,
          status: { in: [...OPEN] },
          ...(selected && { id: { in: selected } }),
        },
        select: { id: true },
      });
      if (selected && wanted.length !== selected.length)
        throw ApiError.conflict(
          "One of the selected invoices is no longer open. Refresh and try again.",
        );

      const ids = wanted.map((w) => w.id);
      await lock(tx, "fee_invoices", ids);
      const invoices = await tx.feeInvoice.findMany({
        where: { id: { in: ids }, status: { in: [...OPEN] } },
      });
      if (invoices.length !== ids.length)
        throw ApiError.conflict(
          "An invoice changed while you were paying. Refresh and try again.",
        );

      // Bring late fines up to the payment date before taking money.
      for (const inv of invoices) {
        const fine = computeFine(inv, input.paymentDate);
        if (fine.gt(inv.fineAmount)) {
          inv.fineAmount = fine;
          inv.totalAmount = inv.subtotal.minus(inv.discountTotal).plus(fine);
          await tx.feeInvoice.update({
            where: { id: inv.id },
            data: { fineAmount: inv.fineAmount, totalAmount: inv.totalAmount },
          });
        }
      }

      const others = selected
        ? await tx.feeInvoice.findMany({
            where: {
              studentId: input.studentId,
              status: { in: [...OPEN] },
              id: { notIn: ids },
            },
            select: { totalAmount: true, paidAmount: true },
          })
        : [];
      const duesBefore = sumDecimals([...invoices, ...others].map(balanceOf));

      const { allocations, leftover } = allocate(
        invoices.map((i) => ({
          id: i.id,
          balance: balanceOf(i),
          periodKey: i.periodKey,
          dueDate: i.dueDate,
          invoiceNo: i.invoiceNo,
        })),
        received,
      );
      if (leftover.gt(0) && !input.allowAdvance) {
        throw ApiError.conflict(
          `The amount is Rs ${leftover.toFixed(2)} more than the selected dues. Confirm that the extra should be kept as advance credit.`,
        );
      }
      const applied = sumDecimals(allocations.map((a) => a.amount));

      const payment = await tx.feePayment.create({
        data: {
          receiptNo: await nextNumber(tx, "RCP", input.paymentDate),
          studentId: input.studentId,
          paymentDate: input.paymentDate,
          totalAmount: received,
          unallocatedAmount: leftover,
          duesBefore,
          duesAfter: duesBefore.minus(applied),
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          receivedById: userId,
          lines: {
            create: input.methods.map((m) => ({
              method: m.method,
              amount: m.amount,
              reference: m.reference,
            })),
          },
          allocations: {
            create: allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amount: a.amount,
            })),
          },
        },
        select: { id: true, receiptNo: true },
      });

      const byId = new Map(invoices.map((i) => [i.id, i]));
      for (const a of allocations) {
        const inv = byId.get(a.invoiceId)!;
        const paid = inv.paidAmount.plus(a.amount);
        await tx.feeInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: paid,
            status: invoiceStatusFor(inv.totalAmount, paid),
          },
        });
      }

      return {
        ...payment,
        received: received.toFixed(2),
        applied: applied.toFixed(2),
        advance: leftover.toFixed(2),
        duplicate: false,
      };
    }, OPTS);
  } catch (e) {
    // Two identical submissions raced: return the one that won.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      input.idempotencyKey
    ) {
      const won = await existing();
      if (won) return { ...won, duplicate: true };
    }
    throw e;
  }
}

// ====================================================================
/** Reversal = a new negative entry. The original is kept and marked REVERSED; invoice balances are restored. */
export async function reversePayment(
  paymentId: string,
  reason: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, "fee_payments", [paymentId]);
    const p = await tx.feePayment.findUnique({
      where: { id: paymentId },
      include: { lines: true, allocations: true },
    });
    if (!p) throw ApiError.notFound("Payment not found");
    if (p.kind !== "PAYMENT")
      throw ApiError.conflict("A reversal entry cannot be reversed");
    if (p.status === "REVERSED")
      throw ApiError.conflict("This payment is already reversed");

    // Credit that was refunded in cash cannot be refunded again by reversing the whole payment.
    const allocated = p.allocations.reduce((s, a) => s.plus(a.amount), ZERO);
    const refundedCredit = p.totalAmount
      .minus(allocated)
      .minus(p.unallocatedAmount);
    if (refundedCredit.gt(0)) {
      throw ApiError.conflict(
        `Rs ${refundedCredit.toFixed(2)} of the advance credit from this payment was already refunded, so it cannot be reversed.`,
      );
    }

    const invoiceIds = [...new Set(p.allocations.map((a) => a.invoiceId))];
    await lock(tx, "fee_invoices", invoiceIds);
    for (const a of p.allocations) {
      const inv = await tx.feeInvoice.findUniqueOrThrow({
        where: { id: a.invoiceId },
      });
      const paid = inv.paidAmount.minus(a.amount);
      if (paid.lt(0))
        throw ApiError.conflict(
          "Invoice totals do not match this payment. Contact support before reversing.",
        );
      await tx.feeInvoice.update({
        where: { id: inv.id },
        data: {
          paidAmount: paid,
          status:
            inv.status === "CANCELLED"
              ? "CANCELLED"
              : invoiceStatusFor(inv.totalAmount, paid),
        },
      });
    }

    const today = todayUtc();
    const reversal = await tx.feePayment.create({
      data: {
        receiptNo: await nextNumber(tx, "REV", today),
        kind: "REVERSAL",
        studentId: p.studentId,
        paymentDate: today,
        totalAmount: p.totalAmount.neg(),
        reversesPaymentId: p.id,
        reversalReason: reason,
        receivedById: userId,
        lines: {
          create: p.lines.map((l) => ({
            method: l.method,
            amount: l.amount.neg(),
            reference: l.reference,
          })),
        },
      },
      select: { id: true, receiptNo: true },
    });
    await tx.feePayment.update({
      where: { id: p.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: userId,
        reversalReason: reason,
      },
    });
    return {
      reversalId: reversal.id,
      reversalReceiptNo: reversal.receiptNo,
      originalReceiptNo: p.receiptNo,
    };
  }, OPTS);
}

// ====================================================================
/** Uses advance credit on open invoices, oldest first. No new receipt: the cash was counted when it arrived. */
export async function applyCredit(studentId: string) {
  return prisma.$transaction(async (tx) => {
    const creditIds = (
      await tx.feePayment.findMany({
        where: {
          studentId,
          kind: "PAYMENT",
          status: "POSTED",
          unallocatedAmount: { gt: 0 },
        },
        select: { id: true },
      })
    ).map((c) => c.id);
    if (creditIds.length === 0)
      throw ApiError.conflict("This student has no advance credit");
    await lock(tx, "fee_payments", creditIds);

    const invoiceIds = (
      await tx.feeInvoice.findMany({
        where: { studentId, status: { in: [...OPEN] } },
        select: { id: true },
      })
    ).map((i) => i.id);
    if (invoiceIds.length === 0)
      throw ApiError.conflict("This student has no open invoices");
    await lock(tx, "fee_invoices", invoiceIds);

    const credits = await tx.feePayment.findMany({
      where: {
        id: { in: creditIds },
        status: "POSTED",
        unallocatedAmount: { gt: 0 },
      },
      orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    });
    const invoices = await tx.feeInvoice.findMany({
      where: { id: { in: invoiceIds }, status: { in: [...OPEN] } },
    });

    const pool = credits.map((c) => ({ id: c.id, left: c.unallocatedAmount }));
    const sorted = [...invoices].sort(
      (a, b) =>
        a.periodKey.localeCompare(b.periodKey) ||
        a.dueDate.getTime() - b.dueDate.getTime() ||
        a.invoiceNo.localeCompare(b.invoiceNo),
    );

    let applied = ZERO;
    let touched = 0;
    for (const inv of sorted) {
      let need = balanceOf(inv);
      let paidNow = ZERO;
      for (const c of pool) {
        if (need.lte(0)) break;
        if (c.left.lte(0)) continue;
        const take = Prisma.Decimal.min(need, c.left);
        await tx.paymentAllocation.create({
          data: { paymentId: c.id, invoiceId: inv.id, amount: take },
        });
        c.left = c.left.minus(take);
        need = need.minus(take);
        paidNow = paidNow.plus(take);
      }
      if (paidNow.gt(0)) {
        const paid = inv.paidAmount.plus(paidNow);
        await tx.feeInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: paid,
            status: invoiceStatusFor(inv.totalAmount, paid),
          },
        });
        applied = applied.plus(paidNow);
        touched++;
      }
    }
    for (const c of pool)
      await tx.feePayment.update({
        where: { id: c.id },
        data: { unallocatedAmount: c.left },
      });
    return {
      applied: applied.toFixed(2),
      invoices: touched,
      creditLeft: sumDecimals(pool.map((c) => c.left)).toFixed(2),
    };
  }, OPTS);
}

// ====================================================================
export async function studentDues(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      admissionNo: true,
      fullName: true,
      fatherName: true,
      status: true,
      enrollments: {
        orderBy: { session: { startDate: "desc" } },
        take: 1,
        select: {
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });
  if (!student) throw ApiError.notFound("Student not found");

  const [invoices, credits] = await Promise.all([
    prisma.feeInvoice.findMany({
      where: { studentId, status: { in: [...OPEN] } },
      orderBy: [{ periodKey: "asc" }, { invoiceNo: "asc" }],
    }),
    prisma.feePayment.aggregate({
      where: { studentId, kind: "PAYMENT", status: "POSTED" },
      _sum: { unallocatedAmount: true },
    }),
  ]);

  const today = todayUtc();
  const rows = invoices.map((i) => {
    const fine = computeFine(i, today);
    const projectedFine = fine.gt(i.fineAmount) ? fine : i.fineAmount;
    const balance = balanceOf(i).plus(projectedFine.minus(i.fineAmount));
    return {
      id: i.id,
      invoiceNo: i.invoiceNo,
      periodKey: i.periodKey,
      dueDate: i.dueDate,
      status: i.status,
      totalAmount: i.totalAmount,
      paidAmount: i.paidAmount,
      fineAmount: i.fineAmount,
      projectedFine,
      balance: balance.toFixed(2),
      overdue: i.dueDate.getTime() < today.getTime(),
    };
  });
  const en = student.enrollments[0];
  return {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: student.fullName,
      fatherName: student.fatherName,
      status: student.status,
      className: en?.class.name ?? null,
      section: en?.section.name ?? null,
    },
    invoices: rows,
    totalDue: sumDecimals(
      rows.map((r) => new Prisma.Decimal(r.balance)),
    ).toFixed(2),
    creditBalance: (credits._sum.unallocatedAmount ?? ZERO).toFixed(2),
  };
}

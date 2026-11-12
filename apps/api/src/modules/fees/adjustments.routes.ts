import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import {
  AdjustmentInput,
  adjustmentListSchema,
  AdjustmentListQuery,
  adjustmentSchema,
} from "./adjustments.schema";
import { invoiceStatusFor } from "./payments.calc";

export const adjustmentsRouter = Router();

adjustmentsRouter.get(
  "/",
  authorize("fees", "VIEW"),
  validate(adjustmentListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as AdjustmentListQuery;
    const where: Prisma.FeeAdjustmentWhereInput = {
      ...(qy.type && { type: qy.type }),
      ...(qy.q && {
        invoice: {
          student: {
            OR: [
              { fullName: { contains: qy.q, mode: "insensitive" } },
              { admissionNo: { contains: qy.q, mode: "insensitive" } },
            ],
          },
        },
      }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.feeAdjustment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          invoice: {
            select: {
              invoiceNo: true,
              periodKey: true,
              student: { select: { admissionNo: true, fullName: true } },
            },
          },
        },
      }),
      prisma.feeAdjustment.count({ where }),
    ]);
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: rows.map((r) => r.createdById).filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        reason: r.reason,
        createdAt: r.createdAt,
        invoiceNo: r.invoice.invoiceNo,
        periodKey: r.invoice.periodKey,
        student: r.invoice.student,
        createdBy: r.createdById ? (name.get(r.createdById) ?? null) : null,
      })),
    });
  }),
);

// Needs the Approve permission: it changes what a family owes.
adjustmentsRouter.post(
  "/",
  authorize("fees", "APPROVE"),
  validate(adjustmentSchema),
  h(async (req, res) => {
    const b = req.body as AdjustmentInput;
    const amount = new Prisma.Decimal(b.amount);

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM fee_invoices WHERE id = ${b.invoiceId} FOR UPDATE`;
        const inv = await tx.feeInvoice.findUnique({
          where: { id: b.invoiceId },
        });
        if (!inv) throw ApiError.notFound("Invoice not found");
        if (inv.status !== "OPEN" && inv.status !== "PARTIAL")
          throw ApiError.conflict(
            "Only open or part-paid invoices can be adjusted",
          );

        const balance = inv.totalAmount.minus(inv.paidAmount);
        if (amount.gt(balance))
          throw ApiError.conflict(
            `The adjustment is more than the invoice balance (Rs ${balance.toFixed(2)})`,
          );

        let data: Prisma.FeeInvoiceUpdateInput;
        if (b.type === "FINE_WAIVER") {
          if (amount.gt(inv.fineAmount))
            throw ApiError.conflict(
              `The invoice fine is only Rs ${inv.fineAmount.toFixed(2)}`,
            );
          // fineType NONE freezes the fine so "Apply late fines" cannot bring it back.
          data = { fineAmount: inv.fineAmount.minus(amount), fineType: "NONE" };
        } else {
          const feesLeft = inv.subtotal.minus(inv.discountTotal);
          if (amount.gt(feesLeft))
            throw ApiError.conflict(
              `The unpaid fees (excluding fine) are only Rs ${feesLeft.toFixed(2)}`,
            );
          data = { discountTotal: inv.discountTotal.plus(amount) };
        }

        const newTotal = inv.totalAmount.minus(amount);
        const status = newTotal.lte(inv.paidAmount)
          ? "PAID"
          : invoiceStatusFor(newTotal, inv.paidAmount);
        await tx.feeInvoice.update({
          where: { id: inv.id },
          data: { ...data, totalAmount: newTotal, status },
        });
        const adj = await tx.feeAdjustment.create({
          data: {
            invoiceId: inv.id,
            studentId: inv.studentId,
            type: b.type,
            amount,
            reason: b.reason,
            createdById: req.user!.id,
          },
          select: { id: true },
        });
        return {
          id: adj.id,
          invoiceNo: inv.invoiceNo,
          newTotal: newTotal.toFixed(2),
          status,
        };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    await writeAudit(req, {
      action: "FEE_ADJUSTED",
      entity: "fee_adjustments",
      entityId: result.id,
      newValues: { ...b, ...result },
    });
    ok(res, result, 201);
  }),
);

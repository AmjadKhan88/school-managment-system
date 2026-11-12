import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { formatNumber } from "../../utils/sequence";
import { idParam } from "../academics/academics.schema";
import { ZERO } from "./invoices.calc";
import { takeFromCredit } from "./payments.calc";
import {
  refundListSchema,
  RefundListQuery,
  refundRequestSchema,
  RefundRequest,
  rejectSchema,
} from "./refunds.schema";

export const refundsRouter = Router();
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const OPTS = { timeout: 20_000, maxWait: 10_000 };

refundsRouter.get(
  "/",
  authorize("refunds", "VIEW"),
  validate(refundListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as RefundListQuery;
    const where: Prisma.FeeRefundWhereInput = {
      ...(qy.status && { status: qy.status }),
      ...(qy.q && {
        student: {
          OR: [
            { fullName: { contains: qy.q, mode: "insensitive" } },
            { admissionNo: { contains: qy.q, mode: "insensitive" } },
          ],
        },
      }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.feeRefund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: { student: { select: { admissionNo: true, fullName: true } } },
      }),
      prisma.feeRefund.count({ where }),
    ]);
    const ids = rows
      .flatMap((r) => [r.requestedById, r.decidedById])
      .filter((x): x is string => !!x);
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        refundNo: r.refundNo,
        amount: r.amount,
        method: r.method,
        reference: r.reference,
        reason: r.reason,
        status: r.status,
        rejectionReason: r.rejectionReason,
        paidDate: r.paidDate,
        createdAt: r.createdAt,
        student: r.student,
        requestedBy: r.requestedById
          ? (name.get(r.requestedById) ?? null)
          : null,
        decidedBy: r.decidedById ? (name.get(r.decidedById) ?? null) : null,
      })),
    });
  }),
);

// ---- Request a refund of advance credit ----
refundsRouter.post(
  "/",
  authorize("refunds", "CREATE"),
  validate(refundRequestSchema),
  h(async (req, res) => {
    const b = req.body as RefundRequest;
    const amount = new Prisma.Decimal(b.amount);

    const row = await prisma.$transaction(async (tx) => {
      if (
        !(await tx.student.findUnique({
          where: { id: b.studentId },
          select: { id: true },
        }))
      )
        throw ApiError.notFound("Student not found");
      const [credit, pending] = await Promise.all([
        tx.feePayment.aggregate({
          where: { studentId: b.studentId, kind: "PAYMENT", status: "POSTED" },
          _sum: { unallocatedAmount: true },
        }),
        tx.feeRefund.aggregate({
          where: { studentId: b.studentId, status: "PENDING" },
          _sum: { amount: true },
        }),
      ]);
      const available = (credit._sum.unallocatedAmount ?? ZERO).minus(
        pending._sum.amount ?? ZERO,
      );
      if (amount.gt(available))
        throw ApiError.conflict(
          `Only Rs ${available.toFixed(2)} of advance credit is available to refund (after pending requests)`,
        );

      const today = todayUtc();
      const key = `REF-${today.getUTCFullYear()}`;
      const c = await tx.counter.upsert({
        where: { key },
        create: { key, value: 1 },
        update: { value: { increment: 1 } },
      });
      return tx.feeRefund.create({
        data: {
          refundNo: formatNumber("REF", today.getUTCFullYear(), c.value, 5),
          studentId: b.studentId,
          amount,
          method: b.method,
          reference: b.reference,
          reason: b.reason,
          requestedById: req.user!.id,
        },
        select: { id: true, refundNo: true },
      });
    }, OPTS);

    await writeAudit(req, {
      action: "REFUND_REQUESTED",
      entity: "fee_refunds",
      entityId: row.id,
      newValues: { ...b, refundNo: row.refundNo },
    });
    ok(res, row, 201);
  }),
);

// ---- Approve and pay: reduces the student's advance credit, oldest first ----
refundsRouter.post(
  "/:id/approve",
  authorize("refunds", "APPROVE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fee_refunds WHERE id = ${req.params.id} FOR UPDATE`;
      const r = await tx.feeRefund.findUnique({ where: { id: req.params.id } });
      if (!r) throw ApiError.notFound("Refund not found");
      if (r.status !== "PENDING")
        throw ApiError.conflict(
          `This refund is already ${r.status.toLowerCase()}`,
        );

      const ids = (
        await tx.feePayment.findMany({
          where: {
            studentId: r.studentId,
            kind: "PAYMENT",
            status: "POSTED",
            unallocatedAmount: { gt: 0 },
          },
          select: { id: true },
        })
      ).map((x) => x.id);
      if (ids.length)
        await tx.$queryRaw`SELECT id FROM fee_payments WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

      const credits = await tx.feePayment.findMany({
        where: {
          id: { in: ids },
          status: "POSTED",
          unallocatedAmount: { gt: 0 },
        },
        orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
      });
      const { takes, shortfall } = takeFromCredit(
        credits.map((c) => ({ id: c.id, left: c.unallocatedAmount })),
        r.amount,
      );
      if (shortfall.gt(0))
        throw ApiError.conflict(
          "The student no longer has enough advance credit for this refund. Reject it, or ask for a smaller amount.",
        );

      for (const t of takes)
        await tx.feePayment.update({
          where: { id: t.id },
          data: { unallocatedAmount: { decrement: t.amount } },
        });
      await tx.feeRefund.update({
        where: { id: r.id },
        data: {
          status: "PAID",
          decidedById: req.user!.id,
          decidedAt: new Date(),
          paidDate: todayUtc(),
        },
      });
      return { id: r.id, refundNo: r.refundNo };
    }, OPTS);

    await writeAudit(req, {
      action: "REFUND_PAID",
      entity: "fee_refunds",
      entityId: result.id,
      newValues: result,
    });
    ok(res, result);
  }),
);

refundsRouter.post(
  "/:id/reject",
  authorize("refunds", "APPROVE"),
  validate(idParam, "params"),
  validate(rejectSchema),
  h(async (req, res) => {
    const r = await prisma.feeRefund.findUnique({
      where: { id: req.params.id },
    });
    if (!r) throw ApiError.notFound("Refund not found");
    if (r.status !== "PENDING")
      throw ApiError.conflict(
        `This refund is already ${r.status.toLowerCase()}`,
      );
    await prisma.feeRefund.update({
      where: { id: r.id },
      data: {
        status: "REJECTED",
        decidedById: req.user!.id,
        decidedAt: new Date(),
        rejectionReason: req.body.reason,
      },
    });
    await writeAudit(req, {
      action: "REFUND_REJECTED",
      entity: "fee_refunds",
      entityId: r.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: r.id });
  }),
);

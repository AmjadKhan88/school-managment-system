import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import {
  applyFinesSchema,
  cancelSchema,
  generateSchema,
  GenerateInput,
  invoiceListSchema,
  InvoiceListQuery,
} from "./invoices.schema";
import { applyLateFines, generateInvoices } from "./invoices.service";

export const invoicesRouter = Router();

// ---- Preview or generate a month of invoices ----
invoicesRouter.post(
  "/generate",
  authorize("fees", "CREATE"),
  validate(generateSchema),
  h(async (req, res) => {
    const b = req.body as GenerateInput;
    const result = await generateInvoices(b, req.user!.id);
    if (!b.dryRun && result.created > 0) {
      await writeAudit(req, {
        action: "INVOICES_GENERATED",
        entity: "fee_invoices",
        newValues: {
          sessionId: b.sessionId,
          periodKey: b.periodKey,
          classId: b.classId,
          created: result.created,
          totals: result.totals,
        },
      });
    }
    ok(res, result, b.dryRun ? 200 : 201);
  }),
);

// ---- Recompute late fines ----
invoicesRouter.post(
  "/apply-fines",
  authorize("fees", "EDIT"),
  validate(applyFinesSchema),
  h(async (req, res) => {
    const { sessionId, asOfDate } = req.body as {
      sessionId?: string;
      asOfDate?: Date;
    };
    const asOf = asOfDate ?? new Date(new Date().toISOString().slice(0, 10));
    const result = await applyLateFines(asOf, sessionId);
    await writeAudit(req, {
      action: "LATE_FINES_APPLIED",
      entity: "fee_invoices",
      newValues: { asOf, sessionId, ...result },
    });
    ok(res, result);
  }),
);

// ---- List with filters and totals ----
invoicesRouter.get(
  "/",
  authorize("fees", "VIEW"),
  validate(invoiceListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as InvoiceListQuery;
    const where: Prisma.FeeInvoiceWhereInput = {
      ...(qy.sessionId && { sessionId: qy.sessionId }),
      ...(qy.periodKey && { periodKey: qy.periodKey }),
      ...(qy.classId && { classId: qy.classId }),
      ...(qy.sectionId && { sectionId: qy.sectionId }),
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
    const summaryWhere: Prisma.FeeInvoiceWhereInput = qy.status
      ? where
      : { ...where, status: { not: "CANCELLED" } };

    const [rows, total, sum] = await prisma.$transaction([
      prisma.feeInvoice.findMany({
        where,
        orderBy: [{ periodKey: "desc" }, { invoiceNo: "desc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          student: { select: { id: true, admissionNo: true, fullName: true } },
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      }),
      prisma.feeInvoice.count({ where }),
      prisma.feeInvoice.aggregate({
        where: summaryWhere,
        _sum: {
          subtotal: true,
          discountTotal: true,
          fineAmount: true,
          totalAmount: true,
          paidAmount: true,
        },
      }),
    ]);

    const z = (d: Prisma.Decimal | null) => d ?? new Prisma.Decimal(0);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      summary: {
        subtotal: z(sum._sum.subtotal).toFixed(2),
        discountTotal: z(sum._sum.discountTotal).toFixed(2),
        fineAmount: z(sum._sum.fineAmount).toFixed(2),
        totalAmount: z(sum._sum.totalAmount).toFixed(2),
        paidAmount: z(sum._sum.paidAmount).toFixed(2),
        outstanding: z(sum._sum.totalAmount)
          .minus(z(sum._sum.paidAmount))
          .toFixed(2),
      },
      items: rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        periodKey: r.periodKey,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        subtotal: r.subtotal,
        discountTotal: r.discountTotal,
        fineAmount: r.fineAmount,
        totalAmount: r.totalAmount,
        paidAmount: r.paidAmount,
        previousBalance: r.previousBalance,
        balance: r.totalAmount.minus(r.paidAmount).toFixed(2),
        status: r.status,
        student: r.student,
        className: r.class.name,
        section: r.section.name,
      })),
    });
  }),
);

// ---- One invoice (voucher) ----
invoicesRouter.get(
  "/:id",
  authorize("fees", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const inv = await prisma.feeInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { category: { sortOrder: "asc" } } },
        student: {
          select: {
            admissionNo: true,
            fullName: true,
            fatherName: true,
            guardians: {
              orderBy: { isPrimary: "desc" },
              take: 1,
              select: { guardian: { select: { fullName: true, phone: true } } },
            },
          },
        },
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
    });
    if (!inv) throw ApiError.notFound("Invoice not found");
    const balance = inv.totalAmount.minus(inv.paidAmount);
    ok(res, {
      ...inv,
      balance: balance.toFixed(2),
      payable: balance.plus(inv.previousBalance).toFixed(2),
    });
  }),
);

// ---- Cancel an unpaid invoice (never deleted). Frees the month for regeneration. ----
invoicesRouter.post(
  "/:id/cancel",
  authorize("fees", "DELETE"),
  validate(idParam, "params"),
  validate(cancelSchema),
  h(async (req, res) => {
    const inv = await prisma.feeInvoice.findUnique({
      where: { id: req.params.id },
    });
    if (!inv) throw ApiError.notFound("Invoice not found");
    if (inv.status === "CANCELLED")
      throw ApiError.conflict("This invoice is already cancelled");
    if (inv.paidAmount.gt(0))
      throw ApiError.conflict(
        "This invoice has payments. Reverse the payments first.",
      );
    const row = await prisma.feeInvoice.update({
      where: { id: inv.id },
      data: {
        status: "CANCELLED",
        periodLock: null,
        cancelledAt: new Date(),
        cancelReason: req.body.reason,
      },
    });
    await writeAudit(req, {
      action: "INVOICE_CANCELLED",
      entity: "fee_invoices",
      entityId: inv.id,
      oldValues: { status: inv.status },
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: row.id, status: row.status });
  }),
);

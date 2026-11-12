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
  discountListSchema,
  DiscountListQuery,
  discountSchema,
  DiscountInput,
} from "./discounts.schema";

export const discountsRouter = Router();

discountsRouter.get(
  "/",
  authorize("discounts", "VIEW"),
  validate(discountListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as DiscountListQuery;
    const where: Prisma.FeeDiscountWhereInput = {
      ...(qy.kind && { kind: qy.kind }),
      ...(qy.status && { status: qy.status }),
      enrollment: {
        ...(qy.sessionId && { sessionId: qy.sessionId }),
        ...(qy.q && {
          student: {
            OR: [
              { fullName: { contains: qy.q, mode: "insensitive" } },
              { admissionNo: { contains: qy.q, mode: "insensitive" } },
            ],
          },
        }),
      },
    };
    const [rows, total] = await prisma.$transaction([
      prisma.feeDiscount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          category: { select: { name: true } },
          enrollment: {
            select: {
              student: { select: { admissionNo: true, fullName: true } },
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      }),
      prisma.feeDiscount.count({ where }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      items: rows.map((d) => ({
        id: d.id,
        kind: d.kind,
        mode: d.mode,
        value: d.value,
        categoryName: d.category?.name ?? null,
        validFromPeriod: d.validFromPeriod,
        validToPeriod: d.validToPeriod,
        reason: d.reason,
        status: d.status,
        createdAt: d.createdAt,
        student: d.enrollment.student,
        className: d.enrollment.class.name,
        section: d.enrollment.section.name,
      })),
    });
  }),
);

// Created PENDING; auto-approved when the creator may approve discounts.
discountsRouter.post(
  "/",
  authorize("discounts", "CREATE"),
  validate(discountSchema),
  h(async (req, res) => {
    const b = req.body as DiscountInput;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: b.enrollmentId },
    });
    if (!enrollment || enrollment.status !== "ENROLLED")
      throw ApiError.badRequest("The student is not currently enrolled");
    if (
      b.categoryId &&
      !(await prisma.feeCategory.findUnique({ where: { id: b.categoryId } }))
    )
      throw ApiError.badRequest("Fee category not found");

    const approve = req.user!.permissions.has("discounts:APPROVE");
    const row = await prisma.feeDiscount.create({
      data: {
        ...b,
        createdById: req.user!.id,
        status: approve ? "APPROVED" : "PENDING",
        approvedById: approve ? req.user!.id : null,
        approvedAt: approve ? new Date() : null,
      },
    });
    await writeAudit(req, {
      action: "DISCOUNT_CREATED",
      entity: "fee_discounts",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);

discountsRouter.post(
  "/:id/approve",
  authorize("discounts", "APPROVE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const d = await prisma.feeDiscount.findUnique({
      where: { id: req.params.id },
    });
    if (!d) throw ApiError.notFound("Discount not found");
    if (d.status !== "PENDING")
      throw ApiError.conflict(
        `This discount is already ${d.status.toLowerCase()}`,
      );
    const row = await prisma.feeDiscount.update({
      where: { id: d.id },
      data: {
        status: "APPROVED",
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "DISCOUNT_APPROVED",
      entity: "fee_discounts",
      entityId: d.id,
    });
    ok(res, { id: row.id, status: row.status });
  }),
);

// Stops the discount applying to future invoices. Invoices already issued are not changed.
discountsRouter.post(
  "/:id/revoke",
  authorize("discounts", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const d = await prisma.feeDiscount.findUnique({
      where: { id: req.params.id },
    });
    if (!d) throw ApiError.notFound("Discount not found");
    if (d.status === "REVOKED")
      throw ApiError.conflict("This discount is already revoked");
    const row = await prisma.feeDiscount.update({
      where: { id: d.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await writeAudit(req, {
      action: "DISCOUNT_REVOKED",
      entity: "fee_discounts",
      entityId: d.id,
    });
    ok(res, { id: row.id, status: row.status });
  }),
);

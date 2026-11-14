import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { ZERO } from "../fees/invoices.calc";
import {
  IncomeInput,
  incomeListSchema,
  IncomeListQuery,
  incomeSchema,
  reasonSchema,
} from "./finance.schema";
import { METHOD_LABEL, nextNo, SOURCE_LABEL } from "./finance.service";

export const incomeRouter = Router();

const incomeWhere = (qy: IncomeListQuery): Prisma.OtherIncomeWhereInput => ({
  ...(qy.status && { status: qy.status }),
  ...(qy.source && { source: qy.source }),
  ...((qy.from || qy.to) && {
    incomeDate: {
      ...(qy.from && { gte: qy.from }),
      ...(qy.to && { lte: qy.to }),
    },
  }),
  ...(qy.q && {
    OR: [
      { description: { contains: qy.q, mode: "insensitive" } },
      { receivedFrom: { contains: qy.q, mode: "insensitive" } },
      { incomeNo: { contains: qy.q, mode: "insensitive" } },
    ],
  }),
});

incomeRouter.get(
  "/",
  authorize("income", "VIEW"),
  validate(incomeListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as IncomeListQuery;
    const where = incomeWhere(qy);
    const [rows, total, active] = await prisma.$transaction([
      prisma.otherIncome.findMany({
        where,
        orderBy: [{ incomeDate: "desc" }, { incomeNo: "desc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
      }),
      prisma.otherIncome.count({ where }),
      prisma.otherIncome.aggregate({
        where: { ...where, status: "ACTIVE" },
        _sum: { amount: true },
      }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      summary: { total: (active._sum.amount ?? ZERO).toFixed(2) },
      items: rows,
    });
  }),
);

incomeRouter.get(
  "/export",
  authorize("income", "EXPORT"),
  validate(incomeListSchema, "query"),
  h(async (req, res) => {
    const rows = await prisma.otherIncome.findMany({
      where: incomeWhere(req.query as unknown as IncomeListQuery),
      orderBy: [{ incomeDate: "asc" }, { incomeNo: "asc" }],
      take: 20000,
    });
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "other_income",
      newValues: { rows: rows.length },
    });
    await sendXlsx(
      res,
      `other-income-${new Date().toISOString().slice(0, 10)}`,
      "Other income",
      [
        { header: "Income no", key: "no", width: 16 },
        { header: "Date", key: "date", width: 13 },
        { header: "Source", key: "source", width: 22 },
        { header: "Description", key: "description", width: 36 },
        { header: "Received from", key: "from", width: 22 },
        { header: "Method", key: "method", width: 14 },
        { header: "Reference", key: "reference", width: 18 },
        { header: "Amount", key: "amount", width: 16, money: true },
        { header: "Status", key: "status", width: 10 },
      ],
      rows.map((r) => ({
        no: r.incomeNo,
        date: r.incomeDate.toISOString().slice(0, 10),
        source: SOURCE_LABEL[r.source],
        description: r.description,
        from: r.receivedFrom ?? "",
        method: METHOD_LABEL[r.method],
        reference: r.reference ?? "",
        amount: Number(r.amount),
        status: r.status === "ACTIVE" ? "Active" : "Voided",
      })),
      {
        description: "Total of active entries",
        amount: rows
          .filter((r) => r.status === "ACTIVE")
          .reduce((s, r) => s + Number(r.amount), 0),
      },
    );
  }),
);

incomeRouter.post(
  "/",
  authorize("income", "CREATE"),
  validate(incomeSchema),
  h(async (req, res) => {
    const b = req.body as IncomeInput;
    const row = await prisma.$transaction(async (tx) =>
      tx.otherIncome.create({
        data: {
          ...b,
          incomeNo: await nextNo(tx, "INC", b.incomeDate),
          createdById: req.user!.id,
        },
        select: { id: true, incomeNo: true },
      }),
    );
    await writeAudit(req, {
      action: "INCOME_RECORDED",
      entity: "other_income",
      entityId: row.id,
      newValues: { ...b, incomeNo: row.incomeNo },
    });
    ok(res, row, 201);
  }),
);

// Entries are not edited. Void with a reason, then record the correct entry.
incomeRouter.post(
  "/:id/void",
  authorize("income", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const i = await prisma.otherIncome.findUnique({
      where: { id: req.params.id },
    });
    if (!i) throw ApiError.notFound("Income entry not found");
    if (i.status === "VOIDED")
      throw ApiError.conflict("This entry is already voided");
    await prisma.otherIncome.update({
      where: { id: i.id },
      data: {
        status: "VOIDED",
        voidReason: req.body.reason,
        voidedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "INCOME_VOIDED",
      entity: "other_income",
      entityId: i.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: i.id });
  }),
);

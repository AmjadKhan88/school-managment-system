import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { emptyToUndef, optEnum, optId } from "../../utils/zodHelpers";
import { period } from "../fees/invoices.schema";

export const reportsRouter = Router();

const ZERO = new Prisma.Decimal(0);
const z0 = (d: Prisma.Decimal | null | undefined) => d ?? ZERO;

// ===================== Class-wise fee summary =====================
const classSummarySchema = z.object({
  sessionId: optId,
  from: z.preprocess(emptyToUndef, period.optional()),
  to: z.preprocess(emptyToUndef, period.optional()),
});
type ClassSummaryQuery = z.infer<typeof classSummarySchema>;

async function classSummary(qy: ClassSummaryQuery) {
  const where: Prisma.FeeInvoiceWhereInput = {
    status: { not: "CANCELLED" },
    ...(qy.sessionId && { sessionId: qy.sessionId }),
    ...((qy.from || qy.to) && {
      periodKey: {
        ...(qy.from && { gte: qy.from }),
        ...(qy.to && { lte: qy.to }),
      },
    }),
  };
  const groups = await prisma.feeInvoice.groupBy({
    by: ["classId"],
    where,
    _sum: {
      subtotal: true,
      discountTotal: true,
      fineAmount: true,
      totalAmount: true,
      paidAmount: true,
    },
    _count: { _all: true },
  });
  const classes = await prisma.class.findMany({
    where: { id: { in: groups.map((g) => g.classId) } },
    select: { id: true, name: true, level: true },
  });
  const cm = new Map(classes.map((c) => [c.id, c]));

  const rows = groups
    .map((g) => {
      const total = z0(g._sum.totalAmount);
      const paid = z0(g._sum.paidAmount);
      return {
        classId: g.classId,
        className: cm.get(g.classId)?.name ?? "—",
        level: cm.get(g.classId)?.level ?? 0,
        invoices: g._count._all,
        fees: z0(g._sum.subtotal).toFixed(2),
        discounts: z0(g._sum.discountTotal).toFixed(2),
        fines: z0(g._sum.fineAmount).toFixed(2),
        totalFee: total.toFixed(2),
        collected: paid.toFixed(2),
        pending: total.minus(paid).toFixed(2),
        collectionPct: total.gt(0)
          ? paid.div(total).mul(100).toDecimalPlaces(1).toNumber()
          : 0,
      };
    })
    .sort((a, b) => a.level - b.level);

  const sum = (
    k: "fees" | "discounts" | "fines" | "totalFee" | "collected" | "pending",
  ) => rows.reduce((s, r) => s.plus(r[k]), ZERO);
  const totalFee = sum("totalFee");
  const collected = sum("collected");
  return {
    rows,
    totals: {
      invoices: rows.reduce((s, r) => s + r.invoices, 0),
      fees: sum("fees").toFixed(2),
      discounts: sum("discounts").toFixed(2),
      fines: sum("fines").toFixed(2),
      totalFee: totalFee.toFixed(2),
      collected: collected.toFixed(2),
      pending: sum("pending").toFixed(2),
      collectionPct: totalFee.gt(0)
        ? collected.div(totalFee).mul(100).toDecimalPlaces(1).toNumber()
        : 0,
    },
  };
}

reportsRouter.get(
  "/class-fee-summary",
  authorize("reports", "VIEW"),
  validate(classSummarySchema, "query"),
  h(async (req, res) =>
    ok(res, await classSummary(req.query as unknown as ClassSummaryQuery)),
  ),
);

reportsRouter.get(
  "/class-fee-summary/export",
  authorize("reports", "EXPORT"),
  validate(classSummarySchema, "query"),
  h(async (req, res) => {
    const r = await classSummary(req.query as unknown as ClassSummaryQuery);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "class_fee_summary",
      newValues: { rows: r.rows.length },
    });
    await sendXlsx(
      res,
      `class-fee-summary-${new Date().toISOString().slice(0, 10)}`,
      "Class-wise fee summary",
      [
        { header: "Class", key: "className", width: 18 },
        { header: "Invoices", key: "invoices", width: 10 },
        { header: "Fees", key: "fees", width: 14, money: true },
        { header: "Discounts", key: "discounts", width: 14, money: true },
        { header: "Fines", key: "fines", width: 12, money: true },
        { header: "Total fee", key: "totalFee", width: 16, money: true },
        { header: "Collected", key: "collected", width: 16, money: true },
        { header: "Pending", key: "pending", width: 16, money: true },
        { header: "Collection %", key: "collectionPct", width: 14 },
      ],
      r.rows.map((x) => ({
        ...x,
        fees: +x.fees,
        discounts: +x.discounts,
        fines: +x.fines,
        totalFee: +x.totalFee,
        collected: +x.collected,
        pending: +x.pending,
      })),
      {
        className: "Total",
        invoices: r.totals.invoices,
        fees: +r.totals.fees,
        discounts: +r.totals.discounts,
        fines: +r.totals.fines,
        totalFee: +r.totals.totalFee,
        collected: +r.totals.collected,
        pending: +r.totals.pending,
        collectionPct: r.totals.collectionPct,
      },
    );
  }),
);

// ===================== Students export =====================
const studentsExportSchema = z.object({
  sessionId: optId,
  classId: optId,
  status: optEnum(["ACTIVE", "PASSED_OUT", "TRANSFERRED", "LEFT"] as const),
});

reportsRouter.get(
  "/students/export",
  authorize("students", "EXPORT"),
  validate(studentsExportSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as z.infer<typeof studentsExportSchema>;
    const enrollmentFilter = {
      ...(qy.sessionId && { sessionId: qy.sessionId }),
      ...(qy.classId && { classId: qy.classId }),
    };
    const students = await prisma.student.findMany({
      where: {
        archivedAt: null,
        ...(qy.status && { status: qy.status }),
        ...(Object.keys(enrollmentFilter).length > 0 && {
          enrollments: { some: enrollmentFilter },
        }),
      },
      take: 20000,
      orderBy: { admissionNo: "asc" },
      select: {
        admissionNo: true,
        fullName: true,
        fatherName: true,
        motherName: true,
        gender: true,
        dateOfBirth: true,
        bFormNo: true,
        admissionDate: true,
        status: true,
        city: true,
        permanentAddress: true,
        enrollments: {
          where: enrollmentFilter,
          orderBy: { session: { startDate: "desc" } },
          take: 1,
          select: {
            rollNo: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
            session: { select: { name: true } },
          },
        },
        guardians: {
          orderBy: { isPrimary: "desc" },
          take: 1,
          select: {
            guardian: { select: { fullName: true, phone: true, email: true } },
          },
        },
      },
    });
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "students",
      newValues: { rows: students.length },
    });
    const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
    await sendXlsx(
      res,
      `students-${new Date().toISOString().slice(0, 10)}`,
      "Students",
      [
        { header: "Admission no", key: "admissionNo", width: 16 },
        { header: "Student", key: "fullName", width: 28 },
        { header: "Father", key: "fatherName", width: 26 },
        { header: "Mother", key: "motherName", width: 24 },
        { header: "Gender", key: "gender", width: 10 },
        { header: "Date of birth", key: "dob", width: 14 },
        { header: "B-Form / ID", key: "bForm", width: 18 },
        { header: "Session", key: "session", width: 12 },
        { header: "Class", key: "className", width: 14 },
        { header: "Section", key: "section", width: 10 },
        { header: "Roll no", key: "rollNo", width: 10 },
        { header: "Status", key: "status", width: 14 },
        { header: "Admission date", key: "admissionDate", width: 14 },
        { header: "Guardian", key: "guardian", width: 24 },
        { header: "Guardian phone", key: "phone", width: 16 },
        { header: "Guardian email", key: "email", width: 26 },
        { header: "City", key: "city", width: 14 },
        { header: "Address", key: "address", width: 34 },
      ],
      students.map((s) => {
        const en = s.enrollments[0];
        const g = s.guardians[0]?.guardian;
        return {
          admissionNo: s.admissionNo,
          fullName: s.fullName,
          fatherName: s.fatherName,
          motherName: s.motherName ?? "",
          gender: s.gender,
          dob: d(s.dateOfBirth),
          bForm: s.bFormNo ?? "",
          session: en?.session.name ?? "",
          className: en?.class.name ?? "",
          section: en?.section.name ?? "",
          rollNo: en?.rollNo ?? "",
          status: s.status,
          admissionDate: d(s.admissionDate),
          guardian: g?.fullName ?? "",
          phone: g?.phone ?? "",
          email: g?.email ?? "",
          city: s.city ?? "",
          address: s.permanentAddress ?? "",
        };
      }),
    );
  }),
);

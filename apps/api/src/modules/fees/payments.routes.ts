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
import { ZERO } from "./invoices.calc";
import {
  applyCreditSchema,
  collectSchema,
  CollectInput,
  paymentListSchema,
  PaymentListQuery,
  reverseSchema,
  searchSchema,
  studentParam,
} from "./payments.schema";
import {
  applyCredit,
  collectPayment,
  reversePayment,
  studentDues,
} from "./payments.service";
import { sendCsv } from "../../utils/csv";
import { sendXlsx } from "../../utils/excel";

export const paymentsRouter = Router();

// ---- Find a student to collect from (any status, with total dues) ----
paymentsRouter.get(
  "/search",
  authorize("fee_collection", "VIEW"),
  validate(searchSchema, "query"),
  h(async (req, res) => {
    const { q } = req.query as unknown as { q: string };
    const students = await prisma.student.findMany({
      where: {
        archivedAt: null,
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { admissionNo: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { fullName: "asc" },
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
    const open = await prisma.feeInvoice.findMany({
      where: {
        studentId: { in: students.map((s) => s.id) },
        status: { in: ["OPEN", "PARTIAL"] },
      },
      select: { studentId: true, totalAmount: true, paidAmount: true },
    });
    const due = new Map<string, Prisma.Decimal>();
    open.forEach((i) =>
      due.set(
        i.studentId,
        (due.get(i.studentId) ?? ZERO).plus(i.totalAmount.minus(i.paidAmount)),
      ),
    );
    ok(
      res,
      students.map((s) => ({
        id: s.id,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
        fatherName: s.fatherName,
        status: s.status,
        className: s.enrollments[0]?.class.name ?? null,
        section: s.enrollments[0]?.section.name ?? null,
        totalDue: (due.get(s.id) ?? ZERO).toFixed(2),
      })),
    );
  }),
);

paymentsRouter.get(
  "/student/:studentId/dues",
  authorize("fee_collection", "VIEW"),
  validate(studentParam, "params"),
  h(async (req, res) => ok(res, await studentDues(req.params.studentId))),
);

// ---- Take a payment ----
paymentsRouter.post(
  "/collect",
  authorize("fee_collection", "CREATE"),
  validate(collectSchema),
  h(async (req, res) => {
    const b = req.body as CollectInput;
    const result = await collectPayment(b, req.user!.id);
    if (!result.duplicate) {
      await writeAudit(req, {
        action: "PAYMENT_RECEIVED",
        entity: "fee_payments",
        entityId: result.id,
        newValues: {
          receiptNo: result.receiptNo,
          studentId: b.studentId,
          methods: b.methods,
        },
      });
    }
    ok(res, result, result.duplicate ? 200 : 201);
  }),
);

// ---- Use advance credit on open invoices ----
paymentsRouter.post(
  "/apply-credit",
  authorize("fee_collection", "CREATE"),
  validate(applyCreditSchema),
  h(async (req, res) => {
    const result = await applyCredit(req.body.studentId);
    await writeAudit(req, {
      action: "CREDIT_APPLIED",
      entity: "fee_payments",
      newValues: { studentId: req.body.studentId, ...result },
    });
    ok(res, result);
  }),
);

// ---- Reverse a payment (needs the Approve permission) ----
paymentsRouter.post(
  "/:id/reverse",
  authorize("fee_collection", "APPROVE"),
  validate(idParam, "params"),
  validate(reverseSchema),
  h(async (req, res) => {
    const result = await reversePayment(
      req.params.id,
      req.body.reason,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "PAYMENT_REVERSED",
      entity: "fee_payments",
      entityId: req.params.id,
      newValues: { ...result, reason: req.body.reason },
    });
    ok(res, result, 201);
  }),
);

// ---- History with totals ----
paymentsRouter.get(
  "/",
  authorize("fee_collection", "VIEW"),
  validate(paymentListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as PaymentListQuery;
    const where: Prisma.FeePaymentWhereInput = {
      ...(qy.studentId && { studentId: qy.studentId }),
      ...(qy.status && { status: qy.status }),
      ...(qy.method && { lines: { some: { method: qy.method } } }),
      ...((qy.from || qy.to) && {
        paymentDate: {
          ...(qy.from && { gte: qy.from }),
          ...(qy.to && { lte: qy.to }),
        },
      }),
      ...(qy.q && {
        student: {
          OR: [
            { fullName: { contains: qy.q, mode: "insensitive" } },
            { admissionNo: { contains: qy.q, mode: "insensitive" } },
          ],
        },
      }),
    };

    const [rows, total, net, byMethod] = await prisma.$transaction([
      prisma.feePayment.findMany({
        where,
        orderBy: [{ paymentDate: "desc" }, { receiptNo: "desc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          student: { select: { admissionNo: true, fullName: true } },
          lines: { select: { method: true } },
        },
      }),
      prisma.feePayment.count({ where }),
      prisma.feePayment.aggregate({ where, _sum: { totalAmount: true } }),
      prisma.feePaymentLine.groupBy({
        by: ["method"],
        where: { payment: where },
        _sum: { amount: true },
        orderBy: { method: "asc" },
      }),
    ]);

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: rows.map((r) => r.receivedById).filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName]));

    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      summary: {
        net: (net._sum.totalAmount ?? ZERO).toFixed(2),
        byMethod: byMethod.map((m) => ({
          method: m.method,
          amount: (m._sum?.amount ?? ZERO).toFixed(2),
        })),
      },
      items: rows.map((r) => ({
        id: r.id,
        receiptNo: r.receiptNo,
        kind: r.kind,
        status: r.status,
        paymentDate: r.paymentDate,
        totalAmount: r.totalAmount,
        methods: [...new Set(r.lines.map((l) => l.method))],
        student: r.student,
        receivedBy: r.receivedById ? (name.get(r.receivedById) ?? null) : null,
      })),
    });
  }),
);

// ---- Export every payment and reversal matching the filters (xlsx or csv) ----
paymentsRouter.get(
  "/export",
  authorize("fee_collection", "EXPORT"),
  validate(paymentListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as PaymentListQuery;
    const format = req.query.format === "csv" ? "csv" : "xlsx";
    const where: Prisma.FeePaymentWhereInput = {
      ...(qy.studentId && { studentId: qy.studentId }),
      ...(qy.status && { status: qy.status }),
      ...(qy.method && { lines: { some: { method: qy.method } } }),
      ...((qy.from || qy.to) && {
        paymentDate: {
          ...(qy.from && { gte: qy.from }),
          ...(qy.to && { lte: qy.to }),
        },
      }),
      ...(qy.q && {
        student: {
          OR: [
            { fullName: { contains: qy.q, mode: "insensitive" } },
            { admissionNo: { contains: qy.q, mode: "insensitive" } },
          ],
        },
      }),
    };
    const rows = await prisma.feePayment.findMany({
      where,
      take: 20000,
      orderBy: [{ paymentDate: "asc" }, { receiptNo: "asc" }],
      include: {
        lines: true,
        student: {
          select: {
            admissionNo: true,
            fullName: true,
            enrollments: {
              orderBy: { session: { startDate: "desc" } },
              take: 1,
              select: {
                class: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: rows.map((r) => r.receivedById).filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName]));

    const methods = [
      "CASH",
      "BANK_TRANSFER",
      "JAZZCASH",
      "EASYPAISA",
      "CHEQUE",
      "OTHER",
    ] as const;
    const data = rows.map((r) => {
      const byMethod: Record<string, number> = {};
      r.lines.forEach((l) => {
        byMethod[l.method] = (byMethod[l.method] ?? 0) + Number(l.amount);
      });
      const en = r.student.enrollments[0];
      return {
        receiptNo: r.receiptNo,
        date: r.paymentDate.toISOString().slice(0, 10),
        admissionNo: r.student.admissionNo,
        student: r.student.fullName,
        className: en ? `${en.class.name} / ${en.section.name}` : "",
        type: r.kind === "REVERSAL" ? "Reversal" : "Payment",
        status:
          r.kind === "REVERSAL"
            ? "Reversal entry"
            : r.status === "REVERSED"
              ? "Reversed"
              : "Received",
        references: r.lines
          .map((l) => l.reference)
          .filter(Boolean)
          .join("; "),
        amount: Number(r.totalAmount),
        receivedBy: r.receivedById ? (name.get(r.receivedById) ?? "") : "",
        ...Object.fromEntries(methods.map((m) => [m, byMethod[m] ?? 0])),
      };
    });

    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "fee_payments",
      newValues: { rows: data.length, format },
    });
    const file = `fee-transactions-${new Date().toISOString().slice(0, 10)}`;
    const heads = [
      "Receipt no",
      "Date",
      "Admission no",
      "Student",
      "Class",
      "Type",
      "Status",
      "References",
      "Amount",
      "Cash",
      "Bank transfer",
      "JazzCash",
      "EasyPaisa",
      "Cheque",
      "Other",
      "Received by",
    ];
    const keys = [
      "receiptNo",
      "date",
      "admissionNo",
      "student",
      "className",
      "type",
      "status",
      "references",
      "amount",
      ...methods,
      "receivedBy",
    ];

    if (format === "csv") return sendCsv(res, file, heads, keys, data);
    await sendXlsx(
      res,
      file,
      "Fee transactions",
      heads.map((header, i) => ({
        header,
        key: keys[i],
        width: i === 3 ? 28 : 16,
        money: i >= 8 && i <= 14,
      })),
      data,
      { student: "Net total", amount: data.reduce((s, d) => s + d.amount, 0) },
    );
  }),
);

// ---- One receipt ----
paymentsRouter.get(
  "/:id",
  authorize("fee_collection", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const p = await prisma.feePayment.findUnique({
      where: { id: req.params.id },
      include: {
        lines: true,
        allocations: {
          include: {
            invoice: {
              select: { invoiceNo: true, periodKey: true, totalAmount: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        student: {
          select: {
            admissionNo: true,
            fullName: true,
            fatherName: true,
            enrollments: {
              orderBy: { session: { startDate: "desc" } },
              take: 1,
              select: {
                class: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!p) throw ApiError.notFound("Receipt not found");

    const [user, original] = await Promise.all([
      p.receivedById
        ? prisma.user.findUnique({
            where: { id: p.receivedById },
            select: { fullName: true },
          })
        : null,
      p.reversesPaymentId
        ? prisma.feePayment.findUnique({
            where: { id: p.reversesPaymentId },
            select: { receiptNo: true },
          })
        : null,
    ]);
    const en = p.student.enrollments[0];
    ok(res, {
      id: p.id,
      receiptNo: p.receiptNo,
      kind: p.kind,
      status: p.status,
      paymentDate: p.paymentDate,
      totalAmount: p.totalAmount,
      unallocatedAmount: p.unallocatedAmount,
      duesBefore: p.duesBefore,
      duesAfter: p.duesAfter,
      notes: p.notes,
      reversalReason: p.reversalReason,
      reversedAt: p.reversedAt,
      reversesReceiptNo: original?.receiptNo ?? null,
      receivedBy: user?.fullName ?? null,
      student: {
        admissionNo: p.student.admissionNo,
        fullName: p.student.fullName,
        fatherName: p.student.fatherName,
        className: en?.class.name ?? null,
        section: en?.section.name ?? null,
      },
      lines: p.lines.map((l) => ({
        method: l.method,
        amount: l.amount,
        reference: l.reference,
      })),
      allocations: p.allocations.map((a) => ({
        amount: a.amount,
        invoiceNo: a.invoice.invoiceNo,
        periodKey: a.invoice.periodKey,
      })),
    });
  }),
);

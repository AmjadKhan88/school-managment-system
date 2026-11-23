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
import { nextNo } from "../finance/finance.service";
import {
  employeeSearchSchema,
  loanApproveSchema,
  loanListSchema,
  LoanListQuery,
  loanSchema,
  LoanInput,
  reasonSchema,
} from "./payroll.schema";
import { LOAN_CATEGORY, postExpense, voidExpense } from "./finance.post";
import { loanExpenseText } from "./posting.calc";

export const loansRouter = Router();
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const f2 = (d: Prisma.Decimal) => d.toFixed(2);
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const include = {
  employee: {
    select: {
      id: true,
      employeeNo: true,
      fullName: true,
      designation: { select: { name: true } },
    },
  },
  recoveries: {
    orderBy: { createdAt: "asc" as const },
    include: { payroll: { select: { slipNo: true } } },
  },
};
type Row = Prisma.StaffLoanGetPayload<{ include: typeof include }>;

const shape = (l: Row) => {
  const recovered = l.recoveries
    .filter((r) => !r.voidedAt)
    .reduce((t, r) => t.plus(r.amount), D(0));
  return {
    id: l.id,
    loanNo: l.loanNo,
    type: l.type,
    status: l.status,
    amount: f2(l.amount),
    instalments: l.instalments,
    instalmentAmount: f2(l.instalmentAmount),
    startPeriod: l.startPeriod,
    reason: l.reason,
    rejectionReason: l.rejectionReason,
    cancelReason: l.cancelReason,
    issuedOn: l.issuedOn,
    issueMethod: l.issueMethod,
    issueReference: l.issueReference,
    createdAt: l.createdAt,
    recovered: f2(recovered),
    balance: f2(l.amount.minus(recovered)),
    employee: {
      id: l.employee.id,
      employeeNo: l.employee.employeeNo,
      fullName: l.employee.fullName,
      designation: l.employee.designation.name,
    },
    recoveriesList: l.recoveries.map((r) => ({
      id: r.id,
      period: r.period,
      amount: f2(r.amount),
      slipNo: r.payroll.slipNo,
      voidedAt: r.voidedAt,
    })),
  };
};

loansRouter.get(
  "/employee-search",
  authorize("payroll", "CREATE"),
  validate(employeeSearchSchema, "query"),
  h(async (req, res) => {
    const { q } = req.query as unknown as { q: string };
    const rows = await prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { employeeNo: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        employeeNo: true,
        fullName: true,
        basicSalary: true,
        designation: { select: { name: true } },
      },
    });
    ok(
      res,
      rows.map((e) => ({
        id: e.id,
        employeeNo: e.employeeNo,
        fullName: e.fullName,
        designation: e.designation.name,
        hasSalary: !!e.basicSalary && e.basicSalary.gt(0),
      })),
    );
  }),
);

loansRouter.get(
  "/",
  authorize("payroll", "VIEW"),
  validate(loanListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as LoanListQuery;
    const where: Prisma.StaffLoanWhereInput = {
      ...(qy.type && { type: qy.type }),
      ...(qy.status && { status: qy.status }),
      ...(qy.q && {
        employee: {
          OR: [
            { fullName: { contains: qy.q, mode: "insensitive" } },
            { employeeNo: { contains: qy.q, mode: "insensitive" } },
          ],
        },
      }),
    };
    const [rows, total, pending] = await prisma.$transaction([
      prisma.staffLoan.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
      }),
      prisma.staffLoan.count({ where }),
      prisma.staffLoan.count({
        where: { status: "PENDING", ...(qy.type && { type: qy.type }) },
      }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      pending,
      items: rows.map(shape),
    });
  }),
);

loansRouter.get(
  "/:id",
  authorize("payroll", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const l = await prisma.staffLoan.findUnique({
      where: { id: req.params.id },
      include,
    });
    if (!l) throw ApiError.notFound("Loan not found");
    ok(res, shape(l));
  }),
);

loansRouter.post(
  "/",
  authorize("payroll", "CREATE"),
  validate(loanSchema),
  h(async (req, res) => {
    const b = req.body as LoanInput;
    const emp = await prisma.employee.findUnique({
      where: { id: b.employeeId },
      select: { id: true, status: true, basicSalary: true },
    });
    if (!emp || emp.status !== "ACTIVE")
      throw ApiError.badRequest("Choose an active employee");
    if (!emp.basicSalary || emp.basicSalary.lte(0))
      throw ApiError.badRequest(
        "Set the employee’s basic salary first (Salary Management)",
      );
    const open = await prisma.staffLoan.findFirst({
      where: { employeeId: b.employeeId, type: b.type, status: "PENDING" },
      select: { loanNo: true },
    });
    if (open)
      throw ApiError.conflict(
        `This employee already has a pending request (${open.loanNo})`,
      );

    const instalmentAmount = D(b.amount)
      .div(b.instalments)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
    const row = await prisma.$transaction(async (tx) =>
      tx.staffLoan.create({
        data: {
          loanNo: await nextNo(tx, "LN", todayUtc()),
          employeeId: b.employeeId,
          type: b.type,
          amount: b.amount,
          instalments: b.instalments,
          instalmentAmount,
          startPeriod: b.startPeriod,
          reason: b.reason,
          requestedById: req.user!.id,
        },
        select: { id: true, loanNo: true },
      }),
    );
    await writeAudit(req, {
      action: "STAFF_LOAN_REQUESTED",
      entity: "staff_loans",
      entityId: row.id,
      newValues: { ...b, loanNo: row.loanNo },
    });
    ok(res, row, 201);
  }),
);

// Approving records when and how the money was paid out. That payout is booked as an expense in the same transaction.
loansRouter.post(
  "/:id/approve",
  authorize("payroll", "APPROVE"),
  validate(idParam, "params"),
  validate(loanApproveSchema),
  h(async (req, res) => {
    const expense = await prisma.$transaction(async (tx) => {
      const l = await tx.staffLoan.findUnique({
        where: { id: req.params.id },
        include: { employee: { select: { fullName: true } } },
      });
      if (!l) throw ApiError.notFound("Loan not found");
      const r = await tx.staffLoan.updateMany({
        where: { id: l.id, status: "PENDING" },
        data: {
          status: "ACTIVE",
          decidedById: req.user!.id,
          decidedAt: new Date(),
          issuedOn: req.body.issuedOn,
          issueMethod: req.body.method,
          issueReference: req.body.reference,
        },
      });
      if (r.count === 0)
        throw ApiError.conflict("This request is no longer pending");
      const exp = await postExpense(tx, {
        category: LOAN_CATEGORY,
        description: loanExpenseText(l.type, l.loanNo),
        amount: l.amount,
        date: req.body.issuedOn,
        method: req.body.method,
        paidTo: l.employee.fullName,
        reference: req.body.reference ?? l.loanNo,
        byUserId: req.user!.id,
      });
      await tx.staffLoan.update({
        where: { id: l.id },
        data: { payoutExpenseId: exp.id },
      });
      return exp;
    });
    await writeAudit(req, {
      action: "STAFF_LOAN_APPROVED",
      entity: "staff_loans",
      entityId: req.params.id,
      newValues: {
        issuedOn: req.body.issuedOn,
        method: req.body.method,
        expenseNo: expense.expenseNo,
      },
    });
    ok(res, { id: req.params.id, expenseNo: expense.expenseNo });
  }),
);

loansRouter.post(
  "/:id/reject",
  authorize("payroll", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await prisma.staffLoan.updateMany({
      where: { id: req.params.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionReason: req.body.reason,
        decidedById: req.user!.id,
        decidedAt: new Date(),
      },
    });
    if (r.count === 0)
      throw ApiError.conflict("This request is no longer pending");
    await writeAudit(req, {
      action: "STAFF_LOAN_REJECTED",
      entity: "staff_loans",
      entityId: req.params.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: req.params.id });
  }),
);

// Pending: whoever requested it or an approver. Active with nothing recovered yet: an approver only, and the payout is voided in the books.
loansRouter.post(
  "/:id/cancel",
  authorize("payroll", "CREATE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const l = await prisma.staffLoan.findUnique({
      where: { id: req.params.id },
      include: {
        recoveries: { where: { voidedAt: null }, select: { id: true } },
      },
    });
    if (!l) throw ApiError.notFound("Loan not found");
    const approver = req.user!.permissions.has("payroll:APPROVE");
    if (l.status === "PENDING") {
      if (l.requestedById !== req.user!.id && !approver)
        throw ApiError.forbidden(
          "Only the person who requested it, or an approver, can cancel this request",
        );
    } else if (l.status === "ACTIVE") {
      if (!approver)
        throw ApiError.forbidden("Only an approver can cancel an active loan");
      if (l.recoveries.length > 0)
        throw ApiError.conflict(
          "Instalments have already been recovered, so this loan cannot be cancelled",
        );
    } else
      throw ApiError.conflict(`This loan is already ${l.status.toLowerCase()}`);

    await prisma.$transaction(async (tx) => {
      await tx.staffLoan.update({
        where: { id: l.id },
        data: { status: "CANCELLED", cancelReason: req.body.reason },
      });
      if (l.payoutExpenseId)
        await voidExpense(
          tx,
          l.payoutExpenseId,
          `${l.loanNo} cancelled: ${req.body.reason}`,
        );
    });
    await writeAudit(req, {
      action: "STAFF_LOAN_CANCELLED",
      entity: "staff_loans",
      entityId: l.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: l.id });
  }),
);

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
import { componentAmount } from "./payroll.calc";
import {
  approveSchema,
  componentSchema,
  draftEditSchema,
  DraftEdit,
  generateSchema,
  paymentListSchema,
  PaymentListQuery,
  paymentSchema,
  PaymentInput,
  reasonSchema,
  runListSchema,
  slipQuerySchema,
  structureListSchema,
  StructureListQuery,
  structureSchema,
  StructureInput,
} from "./payroll.schema";
import {
  approvePayroll,
  discardDraft,
  generatePayroll,
  recordPayment,
  refreshDraft,
  reopenPayroll,
  reversePayment,
  slips,
} from "./payroll.service";

export const payrollRouter = Router();
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const f2 = (d: Prisma.Decimal | null | undefined) =>
  d === null || d === undefined ? null : d.toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);

// =========================== Components ===========================
payrollRouter.get(
  "/components",
  authorize("payroll", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.salaryComponent.findMany({
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
    ),
  ),
);
payrollRouter.post(
  "/components",
  authorize("payroll", "CREATE"),
  validate(componentSchema),
  h(async (req, res) => {
    const row = await prisma.salaryComponent.create({ data: req.body });
    await writeAudit(req, {
      action: "SALARY_COMPONENT_CREATED",
      entity: "salary_components",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);
payrollRouter.put(
  "/components/:id",
  authorize("payroll", "EDIT"),
  validate(idParam, "params"),
  validate(componentSchema),
  h(async (req, res) => {
    const row = await prisma.salaryComponent.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "SALARY_COMPONENT_UPDATED",
      entity: "salary_components",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);
payrollRouter.delete(
  "/components/:id",
  authorize("payroll", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.salaryComponent.delete({ where: { id: req.params.id } }); // Restrict FK: refused once assigned to an employee
    await writeAudit(req, {
      action: "SALARY_COMPONENT_DELETED",
      entity: "salary_components",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Employee salary structure ===========================
payrollRouter.get(
  "/structure",
  authorize("payroll", "VIEW"),
  validate(structureListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as StructureListQuery;
    const where: Prisma.EmployeeWhereInput = {
      ...(qy.status === "ACTIVE" && { status: "ACTIVE" }),
      ...(qy.departmentId && { departmentId: qy.departmentId }),
      ...(qy.q && {
        OR: [
          { fullName: { contains: qy.q, mode: "insensitive" } },
          { employeeNo: { contains: qy.q, mode: "insensitive" } },
        ],
      }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        orderBy: { employeeNo: "asc" },
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          designation: { select: { name: true } },
          salaryItems: { include: { component: true } },
        },
      }),
      prisma.employee.count({ where }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      items: rows.map((e) => {
        const basic = e.basicSalary ?? D(0);
        let allowances = D(0),
          deductions = D(0);
        e.salaryItems
          .filter((s) => s.component.isActive)
          .forEach((s) => {
            const a = componentAmount(basic, {
              label: s.component.name,
              type: s.component.type,
              isPercent: s.component.isPercent,
              value: s.value,
            });
            if (s.component.type === "ALLOWANCE")
              allowances = allowances.plus(a);
            else deductions = deductions.plus(a);
          });
        return {
          id: e.id,
          employeeNo: e.employeeNo,
          fullName: e.fullName,
          designation: e.designation.name,
          status: e.status,
          basicSalary: f2(e.basicSalary),
          allowances: f2(allowances),
          deductions: f2(deductions),
          gross: f2(basic.plus(allowances)),
          estimatedNet: f2(basic.plus(allowances).minus(deductions)),
        };
      }),
    });
  }),
);

payrollRouter.get(
  "/structure/:id",
  authorize("payroll", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const e = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { designation: { select: { name: true } }, salaryItems: true },
    });
    if (!e) throw ApiError.notFound("Employee not found");
    const components = await prisma.salaryComponent.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    });
    ok(res, {
      employee: {
        id: e.id,
        employeeNo: e.employeeNo,
        fullName: e.fullName,
        designation: e.designation.name,
      },
      basicSalary: f2(e.basicSalary),
      items: e.salaryItems.map((s) => ({
        componentId: s.componentId,
        value: s.value.toFixed(2),
      })),
      components,
    });
  }),
);

payrollRouter.put(
  "/structure/:id",
  authorize("payroll", "EDIT"),
  validate(idParam, "params"),
  validate(structureSchema),
  h(async (req, res) => {
    const b = req.body as StructureInput;
    const e = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { salaryItems: true },
    });
    if (!e) throw ApiError.notFound("Employee not found");

    const comps = await prisma.salaryComponent.findMany({
      where: { id: { in: b.items.map((i) => i.componentId) }, isActive: true },
    });
    if (comps.length !== b.items.length)
      throw ApiError.badRequest("A salary component is missing or inactive");
    const bad = b.items.find(
      (i) =>
        comps.find((c) => c.id === i.componentId)!.isPercent && i.value > 100,
    );
    if (bad) throw ApiError.badRequest("A percentage cannot be more than 100");

    const before = new Map(
      e.salaryItems.map((s) => [s.componentId, s.value.toFixed(2)]),
    );
    const changed =
      before.size !== b.items.length ||
      b.items.some((i) => before.get(i.componentId) !== D(i.value).toFixed(2));
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: e.id },
        data: { basicSalary: b.basicSalary },
      });
      await tx.employeeSalaryItem.deleteMany({ where: { employeeId: e.id } });
      if (b.items.length)
        await tx.employeeSalaryItem.createMany({
          data: b.items.map((i) => ({
            employeeId: e.id,
            componentId: i.componentId,
            value: i.value,
          })),
        });
      const logs: {
        employeeId: string;
        field: string;
        oldValue: string | null;
        newValue: string | null;
        changedById: string;
      }[] = [];
      if (!e.basicSalary || !e.basicSalary.eq(b.basicSalary))
        logs.push({
          employeeId: e.id,
          field: "Basic salary",
          oldValue: f2(e.basicSalary),
          newValue: D(b.basicSalary).toFixed(2),
          changedById: req.user!.id,
        });
      if (changed)
        logs.push({
          employeeId: e.id,
          field: "Salary structure",
          oldValue: null,
          newValue: "Updated",
          changedById: req.user!.id,
        });
      if (logs.length) await tx.employeeHistory.createMany({ data: logs });
    });
    await writeAudit(req, {
      action: "SALARY_STRUCTURE_SAVED",
      entity: "employees",
      entityId: e.id,
    }); // amounts are not copied into the audit log
    ok(res, { id: e.id });
  }),
);

// =========================== Monthly payroll ===========================
payrollRouter.get(
  "/runs",
  authorize("payroll", "VIEW"),
  validate(runListSchema, "query"),
  h(async (req, res) => {
    const { period } = req.query as unknown as { period: string };
    const rows = await prisma.payroll.findMany({
      where: { period },
      orderBy: { employee: { fullName: "asc" } },
      include: {
        employee: {
          select: {
            id: true,
            employeeNo: true,
            fullName: true,
            bankName: true,
            accountNo: true,
            designation: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    });
    const sum = (pick: (r: (typeof rows)[number]) => Prisma.Decimal) =>
      rows.reduce((t, r) => t.plus(pick(r)), D(0)).toFixed(2);
    ok(res, {
      period,
      summary: {
        employees: rows.length,
        drafts: rows.filter((r) => r.status === "DRAFT").length,
        approved: rows.filter((r) => r.status === "APPROVED").length,
        net: sum((r) => r.netSalary),
        paid: sum((r) => r.paidAmount),
        balance: sum((r) =>
          r.status === "APPROVED" ? r.netSalary.minus(r.paidAmount) : D(0),
        ),
      },
      items: rows.map((r) => ({
        id: r.id,
        slipNo: r.slipNo,
        status: r.status,
        employee: {
          id: r.employee.id,
          employeeNo: r.employee.employeeNo,
          fullName: r.employee.fullName,
          designation: r.employee.designation.name,
          department: r.employee.department?.name ?? null,
          bankName: r.employee.bankName,
          accountLast4: r.employee.accountNo
            ? r.employee.accountNo.slice(-4)
            : null,
        },
        basic: f2(r.basicSalary),
        allowances: f2(r.allowancesTotal),
        bonus: f2(r.bonus),
        overtime: f2(r.overtimeAmount),
        deductions: f2(r.deductionsTotal),
        loanRecovery: f2(r.loanRecovery),
        absenceDeduction: f2(r.absenceDeduction),
        net: f2(r.netSalary),
        paid: f2(r.paidAmount),
        balance: f2(r.netSalary.minus(r.paidAmount)),
        absenceDays: Number(r.absenceDays),
        absenceOverridden: r.absenceOverridden,
        recordedDays: r.recordedDays,
      })),
    });
  }),
);

// Must stay above /runs/:id
payrollRouter.post(
  "/runs/generate",
  authorize("payroll", "CREATE"),
  validate(generateSchema),
  h(async (req, res) => {
    const r = await generatePayroll(req.body.period, req.user!.id);
    await writeAudit(req, {
      action: "PAYROLL_GENERATED",
      entity: "payrolls",
      newValues: {
        period: req.body.period,
        created: r.created,
        skipped: r.skipped.length,
      },
    });
    ok(res, r, 201);
  }),
);

payrollRouter.post(
  "/runs/approve",
  authorize("payroll", "APPROVE"),
  validate(approveSchema),
  h(async (req, res) => {
    const r = await approvePayroll(req.body.period, req.body.ids, req.user!.id);
    await writeAudit(req, {
      action: "PAYROLL_APPROVED",
      entity: "payrolls",
      newValues: { period: req.body.period, ...r },
    });
    ok(res, r);
  }),
);

payrollRouter.get(
  "/runs/:id",
  authorize("payroll", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const p = await prisma.payroll.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { createdAt: "desc" } },
        employee: {
          select: {
            id: true,
            employeeNo: true,
            fullName: true,
            designation: { select: { name: true } },
          },
        },
      },
    });
    if (!p) throw ApiError.notFound("Payroll not found");
    const EARN = new Set(["BASIC", "ALLOWANCE", "BONUS", "OVERTIME"]);
    ok(res, {
      id: p.id,
      slipNo: p.slipNo,
      period: p.period,
      status: p.status,
      approvedAt: p.approvedAt,
      employee: {
        id: p.employee.id,
        employeeNo: p.employee.employeeNo,
        fullName: p.employee.fullName,
        designation: p.employee.designation.name,
      },
      earnings: p.items
        .filter((i) => EARN.has(i.kind))
        .map((i) => ({ label: i.label, amount: f2(i.amount) })),
      deductions: p.items
        .filter((i) => !EARN.has(i.kind))
        .map((i) => ({ label: i.label, amount: f2(i.amount) })),
      net: f2(p.netSalary),
      paid: f2(p.paidAmount),
      balance: f2(p.netSalary.minus(p.paidAmount)),
      edit: {
        bonus: f2(p.bonus),
        bonusNote: p.bonusNote,
        overtimeHours: p.overtimeHours.toString(),
        overtimeRate: f2(p.overtimeRate),
        absenceDays: p.absenceDays.toString(),
        absenceOverridden: p.absenceOverridden,
        absenceNote: p.absenceNote,
      },
      attendance: {
        present: p.presentDays,
        halfDays: p.halfDays,
        absent: p.absentDays,
        paidLeave: p.paidLeaveDays,
        unpaidLeave: p.unpaidLeaveDays,
        uncovered: p.uncoveredLeaveDays,
        outside: p.outsideDays,
        recorded: p.recordedDays,
        computedAbsenceDays: p.computedAbsenceDays.toString(),
      },
      payments: p.payments.map((x) => ({
        id: x.id,
        receiptNo: x.receiptNo,
        paidOn: x.paidOn,
        amount: f2(x.amount),
        method: x.method,
        reference: x.reference,
        reversedAt: x.reversedAt,
        reverseReason: x.reverseReason,
      })),
    });
  }),
);

payrollRouter.put(
  "/runs/:id",
  authorize("payroll", "EDIT"),
  validate(idParam, "params"),
  validate(draftEditSchema),
  h(async (req, res) => {
    const r = await refreshDraft(req.params.id, req.body as DraftEdit);
    await writeAudit(req, {
      action: "PAYROLL_DRAFT_EDITED",
      entity: "payrolls",
      entityId: req.params.id,
      newValues: {
        absenceNote: req.body.absenceNote,
        bonusNote: req.body.bonusNote,
      },
    });
    ok(res, r);
  }),
);

payrollRouter.post(
  "/runs/:id/recalculate",
  authorize("payroll", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await refreshDraft(req.params.id);
    await writeAudit(req, {
      action: "PAYROLL_RECALCULATED",
      entity: "payrolls",
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);

payrollRouter.delete(
  "/runs/:id",
  authorize("payroll", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await discardDraft(req.params.id);
    await writeAudit(req, {
      action: "PAYROLL_DRAFT_DISCARDED",
      entity: "payrolls",
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);

payrollRouter.post(
  "/runs/:id/reopen",
  authorize("payroll", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await reopenPayroll(req.params.id);
    await writeAudit(req, {
      action: "PAYROLL_REOPENED",
      entity: "payrolls",
      entityId: req.params.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, r);
  }),
);

// =========================== Payments ===========================
payrollRouter.get(
  "/payments",
  authorize("payroll", "VIEW"),
  validate(paymentListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as PaymentListQuery;
    const where: Prisma.SalaryPaymentWhereInput = {
      ...(qy.method && { method: qy.method }),
      ...(qy.employeeId && { employeeId: qy.employeeId }),
      ...(qy.period && { payroll: { period: qy.period } }),
      ...((qy.from || qy.to) && {
        paidOn: {
          ...(qy.from && { gte: qy.from }),
          ...(qy.to && { lte: qy.to }),
        },
      }),
    };
    const [rows, total, sum] = await prisma.$transaction([
      prisma.salaryPayment.findMany({
        where,
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          employee: { select: { id: true, employeeNo: true, fullName: true } },
          payroll: { select: { period: true, slipNo: true } },
        },
      }),
      prisma.salaryPayment.count({ where }),
      prisma.salaryPayment.aggregate({
        _sum: { amount: true },
        where: { ...where, reversedAt: null },
      }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      totalPaid: f2(sum._sum.amount ?? D(0)),
      items: rows.map((x) => ({
        id: x.id,
        receiptNo: x.receiptNo,
        paidOn: x.paidOn,
        amount: f2(x.amount),
        method: x.method,
        reference: x.reference,
        note: x.note,
        reversedAt: x.reversedAt,
        reverseReason: x.reverseReason,
        employee: x.employee,
        period: x.payroll.period,
        slipNo: x.payroll.slipNo,
      })),
    });
  }),
);

payrollRouter.post(
  "/payments",
  authorize("payroll", "CREATE"),
  validate(paymentSchema),
  h(async (req, res) => {
    const r = await recordPayment(req.body as PaymentInput, req.user!.id);
    await writeAudit(req, {
      action: "SALARY_PAID",
      entity: "salary_payments",
      entityId: r.id,
      newValues: {
        receiptNo: r.receiptNo,
        payrollId: req.body.payrollId,
        amount: req.body.amount,
        method: req.body.method,
      },
    });
    ok(res, r, 201);
  }),
);

payrollRouter.post(
  "/payments/:id/reverse",
  authorize("payroll", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await reversePayment(
      req.params.id,
      req.body.reason,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "SALARY_PAYMENT_REVERSED",
      entity: "salary_payments",
      entityId: req.params.id,
      newValues: { receiptNo: r.receiptNo, reason: req.body.reason },
    });
    ok(res, r);
  }),
);

// =========================== Slips ===========================
payrollRouter.get(
  "/slips",
  authorize("payroll", "VIEW"),
  validate(slipQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as { period: string; payrollId?: string };
    const data = await slips(req.user!.schoolId, q.period, q.payrollId);
    await writeAudit(req, {
      action: "SALARY_SLIPS_VIEWED",
      entity: "payrolls",
      newValues: {
        period: q.period,
        payrollId: q.payrollId,
        slips: data.slips.length,
      },
    });
    ok(res, data);
  }),
);

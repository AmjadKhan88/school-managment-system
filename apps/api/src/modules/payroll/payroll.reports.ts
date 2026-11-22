import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import {
  PayReportQuery,
  payReportParamSchema,
  payReportQuerySchema,
  PayReportType,
} from "./payroll.schema";

export const payrollReportsRouter = Router();

interface PayReport {
  title: string;
  note?: string;
  columns: { key: string; header: string; kind?: "money"; width?: number }[];
  rows: Record<string, string | number | null>[];
}
const n = (d: Prisma.Decimal) => Number(d.toFixed(2));
const day = (d: Date) => d.toISOString().slice(0, 10);
const nowPeriod = () => new Date().toISOString().slice(0, 7);
const label = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
const money = (key: string, header: string) => ({
  key,
  header,
  kind: "money" as const,
  width: 14,
});

async function register(q: PayReportQuery): Promise<PayReport> {
  const period = q.period ?? nowPeriod();
  const rows = await prisma.payroll.findMany({
    where: {
      period,
      ...(q.departmentId && { employee: { departmentId: q.departmentId } }),
    },
    orderBy: { employee: { fullName: "asc" } },
    include: {
      employee: {
        select: {
          employeeNo: true,
          fullName: true,
          designation: { select: { name: true } },
        },
      },
    },
  });
  const zero = new Prisma.Decimal(0);
  const tot = {
    basic: zero,
    allow: zero,
    bonus: zero,
    ot: zero,
    ded: zero,
    loan: zero,
    abs: zero,
    net: zero,
    paid: zero,
    bal: zero,
  };
  const lines = rows.map((r) => {
    const bal =
      r.status === "APPROVED" ? r.netSalary.minus(r.paidAmount) : zero;
    tot.basic = tot.basic.plus(r.basicSalary);
    tot.allow = tot.allow.plus(r.allowancesTotal);
    tot.bonus = tot.bonus.plus(r.bonus);
    tot.ot = tot.ot.plus(r.overtimeAmount);
    tot.ded = tot.ded.plus(r.deductionsTotal);
    tot.loan = tot.loan.plus(r.loanRecovery);
    tot.abs = tot.abs.plus(r.absenceDeduction);
    tot.net = tot.net.plus(r.netSalary);
    tot.paid = tot.paid.plus(r.paidAmount);
    tot.bal = tot.bal.plus(bal);
    return {
      no: r.employee.employeeNo,
      employee: r.employee.fullName,
      designation: r.employee.designation.name,
      basic: n(r.basicSalary),
      allowances: n(r.allowancesTotal),
      bonus: n(r.bonus),
      overtime: n(r.overtimeAmount),
      deductions: n(r.deductionsTotal),
      loan: n(r.loanRecovery),
      absence: n(r.absenceDeduction),
      net: n(r.netSalary),
      paid: n(r.paidAmount),
      balance: n(bal),
      status: label(r.status),
    };
  });
  if (lines.length)
    lines.push({
      no: "Total",
      employee: "",
      designation: "",
      basic: n(tot.basic),
      allowances: n(tot.allow),
      bonus: n(tot.bonus),
      overtime: n(tot.ot),
      deductions: n(tot.ded),
      loan: n(tot.loan),
      absence: n(tot.abs),
      net: n(tot.net),
      paid: n(tot.paid),
      balance: n(tot.bal),
      status: "",
    });
  return {
    title: `Payroll register ${period}`,
    columns: [
      { key: "no", header: "No", width: 12 },
      { key: "employee", header: "Employee", width: 26 },
      { key: "designation", header: "Designation", width: 16 },
      money("basic", "Basic"),
      money("allowances", "Allowances"),
      money("bonus", "Bonus"),
      money("overtime", "Overtime"),
      money("deductions", "Deductions"),
      money("loan", "Loans"),
      money("absence", "Absence"),
      money("net", "Net salary"),
      money("paid", "Paid"),
      money("balance", "Balance"),
      { key: "status", header: "Status", width: 12 },
    ],
    rows: lines,
    note: "Net = Basic + Allowances + Bonus + Overtime - Deductions - Absence - Loan recoveries. Balance counts approved payroll only.",
  };
}

async function payments(q: PayReportQuery): Promise<PayReport> {
  const to = q.to ?? new Date(day(new Date()));
  const from =
    q.from ?? new Date(day(new Date(to.getTime() - 29 * 86_400_000)));
  const rows = await prisma.salaryPayment.findMany({
    where: {
      paidOn: { gte: from, lte: to },
      ...(q.method && { method: q.method }),
      ...(q.departmentId && { employee: { departmentId: q.departmentId } }),
    },
    orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    take: 10000,
    include: {
      employee: { select: { employeeNo: true, fullName: true } },
      payroll: { select: { period: true } },
    },
  });
  const total = rows
    .filter((r) => !r.reversedAt)
    .reduce((t, r) => t.plus(r.amount), new Prisma.Decimal(0));
  const lines = rows.map((r) => ({
    receipt: r.receiptNo,
    date: day(r.paidOn),
    employee: r.employee.fullName,
    no: r.employee.employeeNo,
    period: r.payroll.period,
    method: label(r.method),
    reference: r.reference ?? "",
    amount: n(r.amount),
    status: r.reversedAt ? "Reversed" : "Paid",
  }));
  if (lines.length)
    lines.push({
      receipt: "Total",
      date: "",
      employee: "",
      no: "",
      period: "",
      method: "",
      reference: "",
      amount: n(total),
      status: "",
    });
  return {
    title: `Salary payments ${day(from)} to ${day(to)}`,
    columns: [
      { key: "receipt", header: "Receipt", width: 16 },
      { key: "date", header: "Date", width: 13 },
      { key: "employee", header: "Employee", width: 26 },
      { key: "no", header: "No", width: 12 },
      { key: "period", header: "Month", width: 10 },
      { key: "method", header: "Method", width: 14 },
      { key: "reference", header: "Reference", width: 18 },
      money("amount", "Amount"),
      { key: "status", header: "Status", width: 10 },
    ],
    rows: lines,
    note: "Reversed payments are shown but not counted in the total.",
  };
}

async function loans(q: PayReportQuery): Promise<PayReport> {
  const rows = await prisma.staffLoan.findMany({
    where: {
      status: q.status ?? { in: ["PENDING", "ACTIVE"] },
      ...(q.departmentId && { employee: { departmentId: q.departmentId } }),
    },
    orderBy: { createdAt: "asc" },
    include: {
      employee: { select: { employeeNo: true, fullName: true } },
      recoveries: { where: { voidedAt: null }, select: { amount: true } },
    },
  });
  const lines = rows.map((l) => {
    const recovered = l.recoveries.reduce(
      (t, r) => t.plus(r.amount),
      new Prisma.Decimal(0),
    );
    return {
      loanNo: l.loanNo,
      employee: l.employee.fullName,
      no: l.employee.employeeNo,
      type: l.type === "ADVANCE" ? "Advance" : "Loan",
      issued: l.issuedOn ? day(l.issuedOn) : "",
      amount: n(l.amount),
      instalments: l.instalments,
      instalment: n(l.instalmentAmount),
      start: l.startPeriod,
      recovered: n(recovered),
      balance: n(l.amount.minus(recovered)),
      status: label(l.status),
    };
  });
  const open = lines
    .filter((l) => l.status === "Active")
    .reduce((t, l) => t + l.balance, 0);
  if (lines.length)
    lines.push({
      loanNo: "Total outstanding (active)",
      employee: "",
      no: "",
      type: "",
      issued: "",
      amount: 0,
      instalments: 0,
      instalment: 0,
      start: "",
      recovered: 0,
      balance: Math.round(open * 100) / 100,
      status: "",
    });
  return {
    title: "Loans and advances",
    columns: [
      { key: "loanNo", header: "Loan no", width: 16 },
      { key: "employee", header: "Employee", width: 26 },
      { key: "no", header: "No", width: 12 },
      { key: "type", header: "Type", width: 10 },
      { key: "issued", header: "Issued", width: 13 },
      money("amount", "Amount"),
      { key: "instalments", header: "Instalments", width: 11 },
      money("instalment", "Instalment"),
      { key: "start", header: "From", width: 10 },
      money("recovered", "Recovered"),
      money("balance", "Balance"),
      { key: "status", header: "Status", width: 10 },
    ],
    rows: lines,
  };
}

const build = (type: PayReportType, q: PayReportQuery) =>
  type === "register"
    ? register(q)
    : type === "payments"
      ? payments(q)
      : loans(q);

payrollReportsRouter.get(
  "/:type",
  authorize("payroll", "VIEW"),
  validate(payReportParamSchema, "params"),
  validate(payReportQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await build(
        req.params.type as PayReportType,
        req.query as unknown as PayReportQuery,
      ),
    ),
  ),
);

payrollReportsRouter.get(
  "/:type/export",
  authorize("payroll", "EXPORT"),
  validate(payReportParamSchema, "params"),
  validate(payReportQuerySchema, "query"),
  h(async (req, res) => {
    const type = req.params.type as PayReportType;
    const r = await build(type, req.query as unknown as PayReportQuery);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: `payroll_${type}`,
      newValues: { rows: r.rows.length },
    });
    await sendXlsx(
      res,
      `payroll-${type}-${day(new Date())}`,
      r.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
      r.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 12,
      })),
      r.rows,
    );
  }),
);

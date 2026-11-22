import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { nextNo } from "../finance/finance.service";
import {
  computedAbsence,
  ComponentInput,
  computePay,
  defaultOvertimeRate,
  LoanDue,
  outsideDays,
  summariseAttendance,
} from "./payroll.calc";
import type { DraftEdit, PaymentInput } from "./payroll.schema";

type Dec = Prisma.Decimal;
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const OPTS = { timeout: 60_000, maxWait: 10_000 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(iso(new Date()));

export function monthBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start, end, startIso: iso(start), endIso: iso(end) };
}

function groupBy<T extends { employeeId: string | null }>(rows: T[]) {
  const m = new Map<string, T[]>();
  rows.forEach((r) => {
    const k = r.employeeId!;
    const a = m.get(k) ?? [];
    a.push(r);
    m.set(k, a);
  });
  return m;
}

/** Everything a month's payroll needs for each employee who was employed during it. */
async function loadInputs(period: string, ids?: string[]) {
  const { start, end, startIso, endIso } = monthBounds(period);
  const employees = await prisma.employee.findMany({
    where: {
      ...(ids && { id: { in: ids } }),
      joiningDate: { lte: end },
      OR: [{ leavingDate: null }, { leavingDate: { gte: start } }],
    },
    orderBy: { fullName: "asc" },
    include: { salaryItems: { include: { component: true } } },
  });
  const eids = employees.map((e) => e.id);
  const [att, leaves, loans] = await Promise.all([
    prisma.staffAttendance.findMany({
      where: { employeeId: { in: eids }, date: { gte: start, lte: end } },
      select: { employeeId: true, date: true, status: true },
    }),
    prisma.leaveApplication.findMany({
      where: {
        applicantType: "EMPLOYEE",
        status: "APPROVED",
        employeeId: { in: eids },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: {
        employeeId: true,
        startDate: true,
        endDate: true,
        leaveType: true,
      },
    }),
    prisma.staffLoan.findMany({
      where: {
        employeeId: { in: eids },
        status: "ACTIVE",
        startPeriod: { lte: period },
      },
      orderBy: { createdAt: "asc" },
      include: {
        recoveries: { where: { voidedAt: null }, select: { amount: true } },
      },
    }),
  ]);
  const attBy = groupBy(att),
    leaveBy = groupBy(leaves),
    loanBy = groupBy(loans);

  return employees.map((e) => {
    const components: ComponentInput[] = e.salaryItems
      .filter((s) => s.component.isActive)
      .sort((a, b) => a.component.sortOrder - b.component.sortOrder)
      .map((s) => ({
        label: s.component.name,
        type: s.component.type,
        isPercent: s.component.isPercent,
        value: s.value,
      }));
    const stats = summariseAttendance(
      (attBy.get(e.id) ?? []).map((r) => ({
        date: iso(r.date),
        status: r.status,
      })),
      (leaveBy.get(e.id) ?? []).map((l) => ({
        start: iso(l.startDate),
        end: iso(l.endDate),
        type: l.leaveType,
      })),
    );
    const outside = outsideDays(
      startIso,
      endIso,
      iso(e.joiningDate),
      e.leavingDate ? iso(e.leavingDate) : null,
    );
    const dues: LoanDue[] = (loanBy.get(e.id) ?? []).flatMap((l) => {
      const balance = l.amount.minus(
        l.recoveries.reduce((t, r) => t.plus(r.amount), D(0)),
      );
      return balance.gt(0)
        ? [
            {
              loanId: l.id,
              label: `${l.type === "ADVANCE" ? "Advance" : "Loan"} ${l.loanNo}`,
              due: Prisma.Decimal.min(l.instalmentAmount, balance),
            },
          ]
        : [];
    });
    return {
      employee: e,
      components,
      stats,
      outside,
      computedAbsence: computedAbsence(stats, outside),
      loans: dues,
    };
  });
}
type Prep = Awaited<ReturnType<typeof loadInputs>>[number];

interface Overrides {
  bonus: Dec;
  bonusNote: string | null;
  overtimeHours: Dec;
  overtimeRate: Dec | null;
  absenceOverride: Dec | null;
  absenceNote: string | null;
}
const NO_OVERRIDES: Overrides = {
  bonus: D(0),
  bonusNote: null,
  overtimeHours: D(0),
  overtimeRate: null,
  absenceOverride: null,
  absenceNote: null,
};

function build(p: Prep, ov: Overrides) {
  const basic = p.employee.basicSalary!;
  const absenceDays = ov.absenceOverride ?? p.computedAbsence;
  const rate = ov.overtimeRate ?? defaultOvertimeRate(basic);
  const pay = computePay({
    basic,
    components: p.components,
    bonus: ov.bonus,
    overtimeHours: ov.overtimeHours,
    overtimeRate: rate,
    absenceDays,
    loans: p.loans,
  });
  const s = p.stats;
  return {
    lines: pay.lines,
    negative: pay.negative,
    data: {
      basicSalary: basic,
      allowancesTotal: pay.allowancesTotal,
      bonus: pay.bonus,
      bonusNote: ov.bonusNote,
      overtimeHours: ov.overtimeHours,
      overtimeRate: rate,
      overtimeAmount: pay.overtimeAmount,
      deductionsTotal: pay.deductionsTotal,
      loanRecovery: pay.loanRecovery,
      absenceDeduction: pay.absenceDeduction,
      netSalary: pay.netSalary,
      presentDays: s.present,
      halfDays: s.halfDays,
      absentDays: s.absent,
      paidLeaveDays: s.paidLeave,
      unpaidLeaveDays: s.unpaidLeave,
      uncoveredLeaveDays: s.uncoveredLeave,
      outsideDays: p.outside,
      recordedDays: s.recorded,
      computedAbsenceDays: p.computedAbsence,
      absenceDays,
      absenceOverridden: ov.absenceOverride !== null,
      absenceNote: ov.absenceNote,
    },
  };
}

// ---------------- Generate ----------------
export async function generatePayroll(period: string, userId: string) {
  const { start } = monthBounds(period);
  if (start > todayUtc())
    throw ApiError.badRequest("Payroll cannot be run for a future month");

  const [all, existing] = await Promise.all([
    loadInputs(period),
    prisma.payroll.findMany({
      where: { period },
      select: { employeeId: true },
    }),
  ]);
  const have = new Set(existing.map((x) => x.employeeId));
  const skipped: { employee: string; reason: string }[] = [];
  const todo: Prep[] = [];
  for (const p of all) {
    if (have.has(p.employee.id)) continue;
    if (!p.employee.basicSalary || p.employee.basicSalary.lte(0)) {
      skipped.push({
        employee: p.employee.fullName,
        reason: "No basic salary set",
      });
      continue;
    }
    todo.push(p);
  }
  if (todo.length === 0)
    return { created: 0, alreadyGenerated: have.size, skipped };

  try {
    await prisma.$transaction(async (tx) => {
      for (const p of todo) {
        const b = build(p, NO_OVERRIDES);
        const row = await tx.payroll.create({
          data: {
            slipNo: await nextNo(tx, "SAL", start),
            period,
            employeeId: p.employee.id,
            generatedById: userId,
            ...b.data,
          },
          select: { id: true },
        });
        await tx.payrollItem.createMany({
          data: b.lines.map((l, i) => ({
            payrollId: row.id,
            kind: l.kind,
            label: l.label,
            amount: l.amount,
            loanId: l.loanId ?? null,
            sortOrder: i,
          })),
        });
      }
    }, OPTS);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw ApiError.conflict(
        "Payroll for this month was just generated by someone else. Reload.",
      );
    throw e;
  }
  return { created: todo.length, alreadyGenerated: have.size, skipped };
}

// ---------------- Edit or recalculate a draft ----------------
export async function refreshDraft(id: string, edit?: DraftEdit) {
  const p = await prisma.payroll.findUnique({ where: { id } });
  if (!p) throw ApiError.notFound("Payroll not found");
  if (p.status !== "DRAFT")
    throw ApiError.conflict(
      "Only draft payroll can be changed. Reopen it first.",
    );
  const [prep] = await loadInputs(p.period, [p.employeeId]);
  if (!prep || !prep.employee.basicSalary || prep.employee.basicSalary.lte(0))
    throw ApiError.conflict("This employee has no basic salary set");

  const ov: Overrides = edit
    ? {
        bonus: D(edit.bonus),
        bonusNote: edit.bonusNote ?? null,
        overtimeHours: D(edit.overtimeHours),
        overtimeRate:
          edit.overtimeRate !== undefined ? D(edit.overtimeRate) : null,
        absenceOverride:
          edit.absenceDays !== undefined ? D(edit.absenceDays) : null,
        absenceNote: edit.absenceNote ?? null,
      }
    : {
        bonus: p.bonus,
        bonusNote: p.bonusNote,
        overtimeHours: p.overtimeHours,
        overtimeRate: p.overtimeRate.eq(defaultOvertimeRate(p.basicSalary))
          ? null
          : p.overtimeRate, // keep a custom rate, follow the default otherwise
        absenceOverride: p.absenceOverridden ? p.absenceDays : null,
        absenceNote: p.absenceNote,
      };
  const b = build(prep, ov);
  await prisma.$transaction(async (tx) => {
    await tx.payroll.update({ where: { id }, data: b.data });
    await tx.payrollItem.deleteMany({ where: { payrollId: id } }); // derived lines of a draft, rebuilt
    await tx.payrollItem.createMany({
      data: b.lines.map((l, i) => ({
        payrollId: id,
        kind: l.kind,
        label: l.label,
        amount: l.amount,
        loanId: l.loanId ?? null,
        sortOrder: i,
      })),
    });
  }, OPTS);
  return { id, netSalary: b.data.netSalary.toFixed(2), negative: b.negative };
}

export async function discardDraft(id: string) {
  const p = await prisma.payroll.findUnique({ where: { id } });
  if (!p) throw ApiError.notFound("Payroll not found");
  if (p.status !== "DRAFT")
    throw ApiError.conflict("Only draft payroll can be discarded");
  await prisma.payroll.delete({ where: { id } }); // items go with it; nothing has been posted yet
  return { id };
}

// ---------------- Approve and reopen ----------------
export async function approvePayroll(
  period: string,
  ids: string[] | undefined,
  userId: string,
) {
  const drafts = await prisma.payroll.findMany({
    where: { period, status: "DRAFT", ...(ids && { id: { in: ids } }) },
    include: { items: true, employee: { select: { fullName: true } } },
  });
  if (drafts.length === 0)
    throw ApiError.conflict("There is no draft payroll to approve");

  const negative = drafts.filter((d) => d.netSalary.lt(0));
  if (negative.length)
    throw ApiError.conflict(
      `Net salary is negative for ${negative.map((d) => d.employee.fullName).join(", ")}. Fix their deductions first.`,
    );

  const loanIds = [
    ...new Set(
      drafts.flatMap((d) =>
        d.items
          .filter((i) => i.kind === "LOAN" && i.loanId)
          .map((i) => i.loanId!),
      ),
    ),
  ];
  const active = await prisma.staffLoan.count({
    where: { id: { in: loanIds }, status: "ACTIVE" },
  });
  if (active !== loanIds.length)
    throw ApiError.conflict(
      "A loan on these payrolls is no longer active. Recalculate the affected payroll.",
    );

  await prisma.$transaction(async (tx) => {
    for (const d of drafts) {
      await tx.payroll.update({
        where: { id: d.id },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
        },
      });
      for (const it of d.items.filter((i) => i.kind === "LOAN" && i.loanId)) {
        await tx.loanRecovery.create({
          data: {
            loanId: it.loanId!,
            payrollId: d.id,
            period,
            amount: it.amount,
          },
        });
        const loan = await tx.staffLoan.findUniqueOrThrow({
          where: { id: it.loanId! },
          select: { amount: true },
        });
        const recovered = await tx.loanRecovery.aggregate({
          _sum: { amount: true },
          where: { loanId: it.loanId!, voidedAt: null },
        });
        if ((recovered._sum.amount ?? D(0)).gte(loan.amount))
          await tx.staffLoan.update({
            where: { id: it.loanId! },
            data: { status: "SETTLED" },
          });
      }
    }
  }, OPTS);
  return { approved: drafts.length };
}

export async function reopenPayroll(id: string) {
  const p = await prisma.payroll.findUnique({ where: { id } });
  if (!p) throw ApiError.notFound("Payroll not found");
  if (p.status !== "APPROVED")
    throw ApiError.conflict("Only approved payroll can be reopened");
  if (
    await prisma.salaryPayment.count({
      where: { payrollId: id, reversedAt: null },
    })
  ) {
    throw ApiError.conflict(
      "Salary has already been paid against this payroll. Reverse the payments first.",
    );
  }
  await prisma.$transaction(async (tx) => {
    const recs = await tx.loanRecovery.findMany({
      where: { payrollId: id, voidedAt: null },
      select: { loanId: true },
    });
    await tx.loanRecovery.updateMany({
      where: { payrollId: id, voidedAt: null },
      data: { voidedAt: new Date() },
    });
    await tx.staffLoan.updateMany({
      where: { id: { in: recs.map((r) => r.loanId) }, status: "SETTLED" },
      data: { status: "ACTIVE" },
    });
    await tx.payroll.update({
      where: { id },
      data: { status: "DRAFT", approvedById: null, approvedAt: null },
    });
  }, OPTS);
  return { id };
}

// ---------------- Payments ----------------
const lock = (tx: Prisma.TransactionClient, id: string) =>
  tx.$queryRaw(
    Prisma.sql`SELECT id FROM "payrolls" WHERE id = ${id} FOR UPDATE`,
  );

export async function recordPayment(input: PaymentInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, input.payrollId);
    const p = await tx.payroll.findUnique({ where: { id: input.payrollId } });
    if (!p) throw ApiError.notFound("Payroll not found");
    if (p.status !== "APPROVED")
      throw ApiError.conflict("Only approved payroll can be paid");
    const balance = p.netSalary.minus(p.paidAmount);
    const amount = D(input.amount);
    if (amount.gt(balance))
      throw ApiError.conflict(
        `The amount is more than the balance of ${balance.toFixed(2)}`,
      );

    const pay = await tx.salaryPayment.create({
      data: {
        receiptNo: await nextNo(tx, "SPY", input.paidOn),
        payrollId: p.id,
        employeeId: p.employeeId,
        amount,
        paidOn: input.paidOn,
        method: input.method,
        reference: input.reference,
        note: input.note,
        paidById: userId,
      },
      select: { id: true, receiptNo: true },
    });
    await tx.payroll.update({
      where: { id: p.id },
      data: { paidAmount: { increment: amount } },
    });
    return { ...pay, balance: balance.minus(amount).toFixed(2) };
  }, OPTS);
}

export async function reversePayment(
  id: string,
  reason: string,
  userId: string,
) {
  const found = await prisma.salaryPayment.findUnique({
    where: { id },
    select: { payrollId: true },
  });
  if (!found) throw ApiError.notFound("Payment not found");
  return prisma.$transaction(async (tx) => {
    await lock(tx, found.payrollId);
    const pay = await tx.salaryPayment.findUnique({ where: { id } });
    if (!pay) throw ApiError.notFound("Payment not found");
    if (pay.reversedAt)
      throw ApiError.conflict("This payment was already reversed");
    await tx.salaryPayment.update({
      where: { id },
      data: {
        reversedAt: new Date(),
        reversedById: userId,
        reverseReason: reason,
      },
    });
    await tx.payroll.update({
      where: { id: pay.payrollId },
      data: { paidAmount: { decrement: pay.amount } },
    });
    return { id, receiptNo: pay.receiptNo };
  }, OPTS);
}

// ---------------- Slips ----------------
const EARN = new Set(["BASIC", "ALLOWANCE", "BONUS", "OVERTIME"]);
const f2 = (d: Dec) => d.toFixed(2);

export async function slips(
  schoolId: string,
  period: string,
  payrollId?: string,
) {
  const [school, rows] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        name: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    }),
    prisma.payroll.findMany({
      where: {
        period,
        status: "APPROVED",
        ...(payrollId && { id: payrollId }),
      },
      orderBy: { employee: { fullName: "asc" } },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        payments: { where: { reversedAt: null }, orderBy: { paidOn: "asc" } },
        employee: {
          include: {
            designation: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return {
    school: school ?? {
      name: "",
      address: null,
      phone: null,
      email: null,
      logoUrl: null,
    },
    period,
    slips: rows.map((p) => {
      const earnings = p.items
        .filter((i) => EARN.has(i.kind))
        .map((i) => ({ label: i.label, amount: f2(i.amount) }));
      const deductions = p.items
        .filter((i) => !EARN.has(i.kind))
        .map((i) => ({ label: i.label, amount: f2(i.amount) }));
      const gross = p.items
        .filter((i) => EARN.has(i.kind))
        .reduce((t, i) => t.plus(i.amount), D(0));
      const ded = p.items
        .filter((i) => !EARN.has(i.kind))
        .reduce((t, i) => t.plus(i.amount), D(0));
      const e = p.employee;
      return {
        id: p.id,
        slipNo: p.slipNo,
        approvedAt: p.approvedAt,
        employee: {
          employeeNo: e.employeeNo,
          fullName: e.fullName,
          designation: e.designation.name,
          department: e.department?.name ?? null,
          joiningDate: e.joiningDate,
          cnic: e.cnic,
          bankName: e.bankName,
          accountLast4: e.accountNo ? e.accountNo.slice(-4) : null,
        },
        earnings,
        deductions,
        gross: f2(gross),
        totalDeductions: f2(ded),
        net: f2(p.netSalary),
        attendance: {
          present: p.presentDays,
          halfDays: p.halfDays,
          absent: p.absentDays,
          paidLeave: p.paidLeaveDays,
          unpaidLeave: p.unpaidLeaveDays,
          uncovered: p.uncoveredLeaveDays,
          recorded: p.recordedDays,
          absenceDays: Number(p.absenceDays),
        },
        paid: f2(p.paidAmount),
        balance: f2(p.netSalary.minus(p.paidAmount)),
        payments: p.payments.map((x) => ({
          receiptNo: x.receiptNo,
          paidOn: x.paidOn,
          amount: f2(x.amount),
          method: x.method,
          reference: x.reference,
        })),
      };
    }),
  };
}

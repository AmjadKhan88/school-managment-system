import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { authorize, tenant } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { optId } from "../../utils/zodHelpers";
import {
  defaultMonths,
  monthBounds,
  monthsBetween,
} from "../finance/cashbook.calc";
import { monthlyFinance } from "../finance/finance.service";
import { ZERO } from "../fees/invoices.calc";
import { fillMonths } from "./dashboard.calc";

export const dashboardRouter = Router();
const querySchema = z.object({ sessionId: optId });

const z0 = (d: Prisma.Decimal | null | undefined) => d ?? ZERO;

async function studentsSection(
  sessionId: string | undefined,
  monthStart: Date,
  months: string[],
  range: { from: string; to: string },
) {
  const { from, to } = monthBounds(range.from, range.to);
  const live = { archivedAt: null } as const;

  const [total, active, boys, girls, newThisMonth, admissionRows] =
    await Promise.all([
      prisma.student.count({ where: live }),
      prisma.student.count({ where: { ...live, status: "ACTIVE" } }),
      prisma.student.count({
        where: { ...live, status: "ACTIVE", gender: "MALE" },
      }),
      prisma.student.count({
        where: { ...live, status: "ACTIVE", gender: "FEMALE" },
      }),
      prisma.student.count({
        where: { ...live, admissionDate: { gte: monthStart } },
      }),
      prisma.$queryRaw<{ month: string; n: number }[]>(Prisma.sql`
      SELECT to_char(a."admissionDate", 'YYYY-MM') AS month, COUNT(*)::int AS n
      FROM admissions a WHERE a."admissionDate" BETWEEN ${from} AND ${to} GROUP BY 1`),
    ]);

  let byClass: { className: string; level: number; count: number }[] = [];
  if (sessionId) {
    const groups = await prisma.enrollment.groupBy({
      by: ["classId"],
      _count: { _all: true },
      where: {
        sessionId,
        status: "ENROLLED",
        student: { status: "ACTIVE", archivedAt: null },
      },
    });
    const classes = await prisma.class.findMany({
      where: { id: { in: groups.map((g) => g.classId) } },
      select: { id: true, name: true, level: true },
    });
    const cm = new Map(classes.map((c) => [c.id, c]));
    byClass = groups
      .map((g) => ({
        className: cm.get(g.classId)?.name ?? "—",
        level: cm.get(g.classId)?.level ?? 0,
        count: g._count._all,
      }))
      .sort((a, b) => a.level - b.level);
  }

  return {
    total,
    active,
    boys,
    girls,
    newThisMonth,
    byClass,
    admissions: fillMonths(admissionRows, months),
  };
}

async function feesSection(today: Date, month: string) {
  const open: Prisma.FeeInvoiceWhereInput = {
    status: { in: ["OPEN", "PARTIAL"] },
  };
  const overdue: Prisma.FeeInvoiceWhereInput = {
    ...open,
    dueDate: { lt: today },
  };
  const thisMonth: Prisma.FeeInvoiceWhereInput = {
    periodKey: month,
    status: { not: "CANCELLED" },
  };

  const [openAgg, overdueAgg, defaulters, statusGroups, monthAgg] =
    await Promise.all([
      prisma.feeInvoice.aggregate({
        where: open,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.feeInvoice.aggregate({
        where: overdue,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT i."studentId")::int AS n FROM fee_invoices i
      WHERE i.status IN ('OPEN', 'PARTIAL') AND i."dueDate" < ${today}`),
      prisma.feeInvoice.groupBy({
        by: ["status"],
        where: thisMonth,
        _count: { _all: true },
      }),
      prisma.feeInvoice.aggregate({
        where: thisMonth,
        _sum: { totalAmount: true, paidAmount: true },
      }),
    ]);

  const count = (s: string) =>
    statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    pending: z0(openAgg._sum.totalAmount)
      .minus(z0(openAgg._sum.paidAmount))
      .toFixed(2),
    overdue: z0(overdueAgg._sum.totalAmount)
      .minus(z0(overdueAgg._sum.paidAmount))
      .toFixed(2),
    defaulters: defaulters[0]?.n ?? 0,
    invoicedThisMonth: z0(monthAgg._sum.totalAmount).toFixed(2),
    appliedThisMonth: z0(monthAgg._sum.paidAmount).toFixed(2),
    statusThisMonth: {
      paid: count("PAID"),
      partial: count("PARTIAL"),
      open: count("OPEN"),
    },
  };
}

// Dashboard blocks are only returned to users who may see that data.
dashboardRouter.get(
  "/",
  authorize("dashboard", "VIEW"),
  validate(querySchema, "query"),
  h(async (req, res) => {
    const perms = req.user!.permissions;
    const can = (module: string, action = "VIEW") =>
      perms.has(`${module}:${action}`);

    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const today = new Date(now.toISOString().slice(0, 10));
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const range = defaultMonths(now);
    const months = monthsBetween(range.from, range.to);

    const wanted = (req.query as { sessionId?: string }).sessionId;
    const session = await prisma.academicSession.findFirst({
      where: {
        ...tenant(req),
        ...(wanted ? { id: wanted } : { isActive: true }),
      },
    });

    const money =
      can("fees") || can("finance")
        ? await monthlyFinance(range.from, range.to)
        : null;
    const current = money?.rows[money.rows.length - 1];

    const [students, fees, pendingExpenses, pendingRefunds, pendingDiscounts] =
      await Promise.all([
        can("students")
          ? studentsSection(session?.id, monthStart, months, range)
          : null,
        can("fees") ? feesSection(today, month) : null,
        can("expenses", "APPROVE")
          ? prisma.expense.count({ where: { status: "PENDING" } })
          : 0,
        can("refunds", "APPROVE")
          ? prisma.feeRefund.count({ where: { status: "PENDING" } })
          : 0,
        can("discounts", "APPROVE")
          ? prisma.feeDiscount.count({ where: { status: "PENDING" } })
          : 0,
      ]);

    ok(res, {
      asOf: now.toISOString(),
      month,
      session: session ? { id: session.id, name: session.name } : null,
      students,
      fees:
        fees && money && current
          ? {
              ...fees,
              collectedThisMonth: current.fees,
              monthlyCollection: money.rows.map((r) => ({
                month: r.month,
                amount: r.fees,
              })),
            }
          : null,
      finance:
        can("finance") && money && current
          ? {
              thisMonth: {
                income: current.income,
                expenses: current.expenses,
                net: current.net,
                otherIncome: current.otherIncome,
                refunds: current.refunds,
                fees: current.fees,
              },
              months: money.rows.map((r) => ({
                month: r.month,
                income: r.income,
                expenses: r.expenses,
              })),
            }
          : null,
      attention: [
        {
          key: "expenses",
          label: "Expenses waiting for approval",
          count: pendingExpenses,
          to: "/finance/expenses",
        },
        {
          key: "refunds",
          label: "Refunds waiting for approval",
          count: pendingRefunds,
          to: "/fees/refunds",
        },
        {
          key: "discounts",
          label: "Discounts waiting for approval",
          count: pendingDiscounts,
          to: "/fees/discounts",
        },
      ].filter((a) => a.count > 0),
    });
  }),
);

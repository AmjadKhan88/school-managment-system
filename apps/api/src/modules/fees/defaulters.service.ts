import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ZERO } from "./invoices.calc";
import type { DefaultersQuery } from "./defaulters.schema";

interface GroupRow {
  student_id: string;
  total: string;
  paid: string;
  outstanding: string;
  invoices: number;
  oldest: string;
  months: string[];
}

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));

/** One row per student: sums of their overdue, unpaid invoices that match the filters. */
function grouped(f: DefaultersQuery, asOf: Date): Prisma.Sql {
  const conds: Prisma.Sql[] = [
    Prisma.sql`i.status IN ('OPEN', 'PARTIAL')`,
    Prisma.sql`i."dueDate" < ${asOf}`,
  ];
  if (f.sessionId) conds.push(Prisma.sql`i."sessionId" = ${f.sessionId}`);
  if (f.classId) conds.push(Prisma.sql`i."classId" = ${f.classId}`);
  if (f.sectionId) conds.push(Prisma.sql`i."sectionId" = ${f.sectionId}`);
  if (f.periodKey) conds.push(Prisma.sql`i."periodKey" = ${f.periodKey}`);
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(
      Prisma.sql`i."studentId" IN (SELECT s.id FROM students s WHERE s."fullName" ILIKE ${like} OR s."admissionNo" ILIKE ${like})`,
    );
  }
  return Prisma.sql`
    SELECT i."studentId" AS student_id,
           SUM(i."totalAmount") AS total,
           SUM(i."paidAmount") AS paid,
           SUM(i."totalAmount" - i."paidAmount") AS outstanding,
           COUNT(*)::int AS invoices,
           MIN(i."periodKey") AS oldest,
           ARRAY_AGG(i."periodKey" ORDER BY i."periodKey") AS months
    FROM fee_invoices i
    WHERE ${Prisma.join(conds, " AND ")}
    GROUP BY i."studentId"
    HAVING SUM(i."totalAmount" - i."paidAmount") > CAST(${String(Math.max(f.minOutstanding, 0))} AS numeric)`;
}

const ORDER: Record<DefaultersQuery["sortBy"], Prisma.Sql> = {
  outstanding: Prisma.sql`ORDER BY g.outstanding DESC, s."fullName" ASC`,
  oldest: Prisma.sql`ORDER BY g.oldest ASC, g.outstanding DESC`,
  name: Prisma.sql`ORDER BY s."fullName" ASC`,
};

export async function listDefaulters(
  f: DefaultersQuery,
  opts: { all?: boolean } = {},
) {
  const asOf = todayUtc();
  const base = grouped(f, asOf);
  const limit = opts.all ? 5000 : f.pageSize;
  const offset = opts.all ? 0 : (f.page - 1) * f.pageSize;

  const [rows, summary] = await Promise.all([
    prisma.$queryRaw<GroupRow[]>`
      SELECT g.student_id, g.total::text AS total, g.paid::text AS paid, g.outstanding::text AS outstanding,
             g.invoices, g.oldest, g.months
      FROM (${base}) g
      JOIN students s ON s.id = g.student_id
      ${ORDER[f.sortBy]}
      LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ students: number; outstanding: string }[]>`
      SELECT COUNT(*)::int AS students, COALESCE(SUM(g.outstanding), 0)::text AS outstanding FROM (${base}) g`,
  ]);

  const ids = rows.map((r) => r.student_id);
  const [students, lastPaid, lastReminder] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
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
        guardians: {
          orderBy: { isPrimary: "desc" },
          take: 1,
          select: { guardian: { select: { fullName: true, phone: true } } },
        },
      },
    }),
    prisma.feePayment.groupBy({
      by: ["studentId"],
      where: { studentId: { in: ids }, kind: "PAYMENT", status: "POSTED" },
      _max: { paymentDate: true },
    }),
    prisma.feeReminder.groupBy({
      by: ["studentId"],
      where: { studentId: { in: ids } },
      _max: { createdAt: true },
      _count: { _all: true },
    }),
  ]);
  const sm = new Map(students.map((s) => [s.id, s]));
  const lp = new Map(lastPaid.map((x) => [x.studentId, x._max.paymentDate]));
  const lr = new Map(
    lastReminder.map((x) => [
      x.studentId,
      { at: x._max.createdAt, count: x._count._all },
    ]),
  );

  const money = (v: string) => new Prisma.Decimal(v).toFixed(2);
  const items = rows.map((r) => {
    const s = sm.get(r.student_id);
    const en = s?.enrollments[0];
    const g = s?.guardians[0]?.guardian;
    return {
      studentId: r.student_id,
      admissionNo: s?.admissionNo ?? "",
      fullName: s?.fullName ?? "",
      fatherName: s?.fatherName ?? "",
      className: en?.class.name ?? null,
      section: en?.section.name ?? null,
      guardianName: g?.fullName ?? null,
      guardianPhone: g?.phone ?? null,
      totalFee: money(r.total),
      paid: money(r.paid),
      outstanding: money(r.outstanding),
      overdueMonths: r.invoices,
      months: r.months,
      oldestPeriod: r.oldest,
      lastPaymentDate: lp.get(r.student_id) ?? null,
      lastReminderAt: lr.get(r.student_id)?.at ?? null,
      reminderCount: lr.get(r.student_id)?.count ?? 0,
    };
  });

  return {
    items,
    total: summary[0]?.students ?? 0,
    totalOutstanding: new Prisma.Decimal(
      summary[0]?.outstanding ?? "0",
    ).toFixed(2),
    asOf,
  };
}

export const zeroMoney = ZERO.toFixed(2);

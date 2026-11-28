import { Prisma } from "@prisma/client";
import { monthBounds, pickBilled } from "./transport.calc";

export interface TransportLine {
  categoryId: string;
  description: string;
  amount: Prisma.Decimal;
}

/**
 * The Transport Fee line for each student for a month. Used when monthly invoices are generated.
 * Empty when the Transport Fee category (code TRN) is missing, inactive or not monthly.
 */
export async function loadTransportBilling(
  tx: Prisma.TransactionClient,
  studentIds: string[],
  periodKey: string,
) {
  const out = new Map<string, TransportLine>();
  const cat = await tx.feeCategory.findUnique({
    where: { code: "TRN" },
    select: { id: true, name: true, isActive: true, frequency: true },
  });
  if (!cat || !cat.isActive || cat.frequency !== "MONTHLY") return out;

  const { start, end } = monthBounds(periodKey);
  const rows = await tx.transportAssignment.findMany({
    where: {
      studentId: { in: studentIds },
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      studentId: true,
      startDate: true,
      monthlyFee: true,
      route: { select: { name: true } },
    },
  });
  const byStudent = new Map<string, typeof rows>();
  rows.forEach((r) =>
    byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]),
  );
  for (const [studentId, stays] of byStudent) {
    const stay = pickBilled(stays);
    if (stay && stay.monthlyFee.gt(0))
      out.set(studentId, {
        categoryId: cat.id,
        description: `${cat.name} (${stay.route.name})`,
        amount: stay.monthlyFee,
      });
  }
  return out;
}

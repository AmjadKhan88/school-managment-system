import { FeeFrequency, Prisma } from "@prisma/client";

export interface ItemRow {
  categoryId: string;
  amount: Prisma.Decimal;
  category: { name: string; code: string; frequency: FeeFrequency };
}
export interface OverrideRow {
  categoryId: string;
  amount: Prisma.Decimal;
  reason?: string | null;
}

/** Structure prices with each student's overrides applied. */
export function effectiveItems(items: ItemRow[], overrides: OverrideRow[]) {
  const byCategory = new Map(overrides.map((o) => [o.categoryId, o]));
  return items.map((i) => {
    const o = byCategory.get(i.categoryId);
    return {
      categoryId: i.categoryId,
      name: i.category.name,
      code: i.category.code,
      frequency: i.category.frequency,
      defaultAmount: i.amount,
      overrideAmount: o?.amount ?? null,
      overrideReason: o?.reason ?? null,
      amount: o?.amount ?? i.amount,
    };
  });
}

type Priced = { frequency: FeeFrequency; amount: Prisma.Decimal };
const sum = (rows: Priced[]) =>
  rows.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));

export const monthlyTotal = (rows: Priced[]) =>
  sum(rows.filter((r) => r.frequency === "MONTHLY"));
export const otherTotal = (rows: Priced[]) =>
  sum(rows.filter((r) => r.frequency !== "MONTHLY"));

export const structureInclude = {
  items: {
    orderBy: { category: { sortOrder: "asc" } },
    include: { category: true },
  },
} satisfies Prisma.FeeStructureInclude;

export type StructureWithItems = Prisma.FeeStructureGetPayload<{
  include: typeof structureInclude;
}>;

export function structureDto(s: StructureWithItems) {
  const rows = s.items.map((i) => ({
    frequency: i.category.frequency,
    amount: i.amount,
  }));
  return {
    id: s.id,
    sessionId: s.sessionId,
    classId: s.classId,
    dueDay: s.dueDay,
    fineType: s.fineType,
    fineAmount: s.fineAmount,
    graceDays: s.graceDays,
    items: s.items.map((i) => ({
      categoryId: i.categoryId,
      amount: i.amount,
      category: {
        name: i.category.name,
        code: i.category.code,
        frequency: i.category.frequency,
      },
    })),
    monthlyTotal: monthlyTotal(rows).toFixed(2),
    otherTotal: otherTotal(rows).toFixed(2),
  };
}

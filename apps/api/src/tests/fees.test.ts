import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  effectiveItems,
  monthlyTotal,
  otherTotal,
} from "../modules/fees/fees.helpers";
import { money, structureSchema } from "../modules/fees/fees.schema";

const D = (n: number) => new Prisma.Decimal(n);
const item = (
  id: string,
  amount: number,
  frequency: "MONTHLY" | "ONE_TIME" | "YEARLY",
) => ({
  categoryId: id,
  amount: D(amount),
  category: { name: id, code: id, frequency },
});

describe("money", () => {
  it("rounds to 2 decimals", () => expect(money.parse("10.456")).toBe(10.46));
  it("rejects negatives", () =>
    expect(money.safeParse("-1").success).toBe(false));
});

describe("structure payload", () => {
  const base = {
    sessionId: "s",
    classId: "c",
    items: [{ categoryId: "a", amount: 1500 }],
  };
  it("applies defaults", () => {
    const r = structureSchema.parse(base);
    expect(r.dueDay).toBe(10);
    expect(r.fineType).toBe("NONE");
  });
  it("rejects a duplicate category", () => {
    expect(
      structureSchema.safeParse({
        ...base,
        items: [...base.items, ...base.items],
      }).success,
    ).toBe(false);
  });
  it("requires a fine amount when a fine type is chosen", () => {
    expect(
      structureSchema.safeParse({ ...base, fineType: "FIXED" }).success,
    ).toBe(false);
    expect(
      structureSchema.safeParse({ ...base, fineType: "FIXED", fineAmount: 50 })
        .success,
    ).toBe(true);
  });
  it("rejects a due day above 28", () => {
    expect(structureSchema.safeParse({ ...base, dueDay: 31 }).success).toBe(
      false,
    );
  });
});

describe("effective fees", () => {
  const items = [
    item("tui", 3000, "MONTHLY"),
    item("trn", 1000, "MONTHLY"),
    item("adm", 5000, "ONE_TIME"),
  ];
  it("uses structure prices without overrides", () => {
    const rows = effectiveItems(items, []);
    expect(monthlyTotal(rows).toFixed(2)).toBe("4000.00");
    expect(otherTotal(rows).toFixed(2)).toBe("5000.00");
  });
  it("applies an override, and zero waives a fee", () => {
    const rows = effectiveItems(items, [
      { categoryId: "tui", amount: D(2500) },
      { categoryId: "trn", amount: D(0) },
    ]);
    expect(monthlyTotal(rows).toFixed(2)).toBe("2500.00");
  });
  it("adds decimals exactly", () => {
    const rows = effectiveItems(
      [item("a", 0.1, "MONTHLY"), item("b", 0.2, "MONTHLY")],
      [],
    );
    expect(monthlyTotal(rows).toFixed(2)).toBe("0.30");
  });
});

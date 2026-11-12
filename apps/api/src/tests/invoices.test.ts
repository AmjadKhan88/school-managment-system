import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  applyDiscounts,
  computeFine,
  Line,
  periodDueDate,
  periodOverlapsSession,
} from "../modules/fees/invoices.calc";
import { generateSchema } from "../modules/fees/invoices.schema";

const D = (n: number) => new Prisma.Decimal(n);
const line = (
  id: string,
  amount: number,
  frequency: "MONTHLY" | "ONE_TIME" | "YEARLY" = "MONTHLY",
): Line => ({
  categoryId: id,
  description: id,
  frequency,
  amount: D(amount),
  discount: D(0),
});
const rule = (
  r: Partial<{
    mode: "PERCENT" | "FIXED";
    value: number;
    categoryId: string | null;
    from: string;
    to: string;
  }>,
) => ({
  mode: r.mode ?? "PERCENT",
  value: D(r.value ?? 10),
  categoryId: r.categoryId ?? null,
  validFromPeriod: r.from ?? null,
  validToPeriod: r.to ?? null,
});

describe("discounts", () => {
  const lines = [
    line("tui", 3000),
    line("trn", 1000),
    line("adm", 5000, "ONE_TIME"),
  ];
  it("percent applies to monthly lines only when unscoped", () => {
    const out = applyDiscounts(lines, [rule({ value: 10 })], "2026-11");
    expect(out.map((l) => l.discount.toFixed(2))).toEqual([
      "300.00",
      "100.00",
      "0.00",
    ]);
  });
  it("a scoped discount can target a one-time fee", () => {
    const out = applyDiscounts(
      lines,
      [rule({ value: 50, categoryId: "adm" })],
      "2026-11",
    );
    expect(out[2].discount.toFixed(2)).toBe("2500.00");
  });
  it("a fixed amount is spread over lines and capped", () => {
    const out = applyDiscounts(
      [line("a", 300), line("b", 300)],
      [rule({ mode: "FIXED", value: 500 })],
      "2026-11",
    );
    expect(out.map((l) => l.discount.toFixed(2))).toEqual(["300.00", "200.00"]);
    const capped = applyDiscounts(
      [line("a", 100)],
      [rule({ mode: "FIXED", value: 500 })],
      "2026-11",
    );
    expect(capped[0].discount.toFixed(2)).toBe("100.00");
  });
  it("respects the month range", () => {
    const r = [rule({ value: 10, from: "2026-12", to: "2027-02" })];
    expect(applyDiscounts(lines, r, "2026-11")[0].discount.toFixed(2)).toBe(
      "0.00",
    );
    expect(applyDiscounts(lines, r, "2026-12")[0].discount.toFixed(2)).toBe(
      "300.00",
    );
  });
  it("never discounts below zero when rules stack", () => {
    const out = applyDiscounts(
      [line("a", 100)],
      [rule({ value: 80 }), rule({ value: 80 })],
      "2026-11",
    );
    expect(out[0].discount.toFixed(2)).toBe("100.00");
  });
});

describe("late fines", () => {
  const due = new Date(Date.UTC(2026, 10, 10));
  const base = { fineRate: D(50), graceDays: 3, dueDate: due };
  it("no fine within grace", () =>
    expect(
      computeFine(
        { ...base, fineType: "PER_DAY" },
        new Date(Date.UTC(2026, 10, 13)),
      ).toFixed(2),
    ).toBe("0.00"));
  it("per-day fine counts days after grace", () =>
    expect(
      computeFine(
        { ...base, fineType: "PER_DAY" },
        new Date(Date.UTC(2026, 10, 18)),
      ).toFixed(2),
    ).toBe("250.00"));
  it("fixed fine is charged once", () =>
    expect(
      computeFine(
        { ...base, fineType: "FIXED" },
        new Date(Date.UTC(2027, 0, 1)),
      ).toFixed(2),
    ).toBe("50.00"));
  it("no rule, no fine", () =>
    expect(
      computeFine(
        { ...base, fineType: "NONE" },
        new Date(Date.UTC(2027, 0, 1)),
      ).toFixed(2),
    ).toBe("0.00"));
});

describe("periods", () => {
  it("builds the due date", () =>
    expect(periodDueDate("2026-11", 10).toISOString().slice(0, 10)).toBe(
      "2026-11-10",
    ));
  it("checks the session window", () => {
    const s = new Date(Date.UTC(2026, 3, 1)),
      e = new Date(Date.UTC(2027, 2, 31));
    expect(periodOverlapsSession("2026-11", s, e)).toBe(true);
    expect(periodOverlapsSession("2027-04", s, e)).toBe(false);
  });
});

describe("generate payload", () => {
  it("needs a class or selected students", () => {
    expect(
      generateSchema.safeParse({ sessionId: "s", periodKey: "2026-11" })
        .success,
    ).toBe(false);
    expect(
      generateSchema.safeParse({
        sessionId: "s",
        periodKey: "2026-11",
        classId: "c",
      }).success,
    ).toBe(true);
  });
  it("rejects a malformed month", () => {
    expect(
      generateSchema.safeParse({
        sessionId: "s",
        periodKey: "2026-13",
        classId: "c",
      }).success,
    ).toBe(false);
  });
});

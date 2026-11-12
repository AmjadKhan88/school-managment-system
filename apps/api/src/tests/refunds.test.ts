import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { adjustmentSchema } from "../modules/fees/adjustments.schema";
import { takeFromCredit } from "../modules/fees/payments.calc";
import { refundRequestSchema } from "../modules/fees/refunds.schema";

const D = (n: number) => new Prisma.Decimal(n);

describe("takeFromCredit", () => {
  const pool = [
    { id: "a", left: D(1000) },
    { id: "b", left: D(500) },
  ];
  it("takes from the oldest credit first", () => {
    const r = takeFromCredit(pool, D(1200));
    expect(r.takes.map((t) => [t.id, t.amount.toFixed(2)])).toEqual([
      ["a", "1000.00"],
      ["b", "200.00"],
    ]);
    expect(r.shortfall.toFixed(2)).toBe("0.00");
  });
  it("reports a shortfall when credit is not enough", () => {
    expect(takeFromCredit(pool, D(2000)).shortfall.toFixed(2)).toBe("500.00");
  });
  it("skips empty credit", () => {
    expect(
      takeFromCredit(
        [
          { id: "x", left: D(0) },
          { id: "y", left: D(300) },
        ],
        D(100),
      ).takes.map((t) => t.id),
    ).toEqual(["y"]);
  });
});

describe("adjustment payload", () => {
  const ok = {
    invoiceId: "i",
    type: "FINE_WAIVER",
    amount: 100,
    reason: "Parent was ill",
  };
  it("accepts a valid adjustment", () =>
    expect(adjustmentSchema.safeParse(ok).success).toBe(true));
  it("needs a reason and a positive amount", () => {
    expect(adjustmentSchema.safeParse({ ...ok, reason: "x" }).success).toBe(
      false,
    );
    expect(adjustmentSchema.safeParse({ ...ok, amount: 0 }).success).toBe(
      false,
    );
  });
  it("rejects unknown types", () =>
    expect(adjustmentSchema.safeParse({ ...ok, type: "CHARGE" }).success).toBe(
      false,
    ));
});

describe("refund payload", () => {
  const base = {
    studentId: "s",
    amount: 500,
    method: "CASH",
    reason: "Student left the school",
  };
  it("accepts a cash refund without a reference", () =>
    expect(refundRequestSchema.safeParse(base).success).toBe(true));
  it("needs a reference for bank and cheque refunds", () => {
    expect(
      refundRequestSchema.safeParse({ ...base, method: "BANK_TRANSFER" })
        .success,
    ).toBe(false);
    expect(
      refundRequestSchema.safeParse({
        ...base,
        method: "CHEQUE",
        reference: "CHQ-9",
      }).success,
    ).toBe(true);
  });
});

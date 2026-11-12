import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  allocate,
  invoiceStatusFor,
  sortOldestFirst,
} from "../modules/fees/payments.calc";
import { collectSchema } from "../modules/fees/payments.schema";

const D = (n: number) => new Prisma.Decimal(n);
const inv = (id: string, periodKey: string, balance: number, dueDay = 10) => ({
  id,
  periodKey,
  balance: D(balance),
  dueDate: new Date(Date.UTC(2026, 0, dueDay)),
  invoiceNo: `INV-${id}`,
});

describe("allocation", () => {
  const invoices = [
    inv("c", "2026-12", 4000),
    inv("a", "2026-10", 4000),
    inv("b", "2026-11", 4000),
  ];
  it("pays the oldest month first", () => {
    expect(sortOldestFirst(invoices).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
  it("covers whole invoices then part of the next", () => {
    const r = allocate(invoices, D(6000));
    expect(
      r.allocations.map((a) => [a.invoiceId, a.amount.toFixed(2)]),
    ).toEqual([
      ["a", "4000.00"],
      ["b", "2000.00"],
    ]);
    expect(r.leftover.toFixed(2)).toBe("0.00");
  });
  it("returns the extra as leftover (advance)", () => {
    const r = allocate(invoices, D(13000));
    expect(r.leftover.toFixed(2)).toBe("1000.00");
  });
  it("allocates nothing for a zero amount", () => {
    expect(allocate(invoices, D(0)).allocations).toHaveLength(0);
  });
  it("allocated money never exceeds what was received", () => {
    const r = allocate(invoices, D(5555.55));
    const total = r.allocations
      .reduce((s, a) => s.plus(a.amount), D(0))
      .plus(r.leftover);
    expect(total.toFixed(2)).toBe("5555.55");
  });
});

describe("invoice status", () => {
  it("moves OPEN, PARTIAL, PAID", () => {
    expect(invoiceStatusFor(D(1000), D(0))).toBe("OPEN");
    expect(invoiceStatusFor(D(1000), D(400))).toBe("PARTIAL");
    expect(invoiceStatusFor(D(1000), D(1000))).toBe("PAID");
  });
});

describe("collect payload", () => {
  const base = { studentId: "s", methods: [{ method: "CASH", amount: 1000 }] };
  it("accepts cash without a reference", () =>
    expect(collectSchema.safeParse(base).success).toBe(true));
  it("requires a reference for bank transfers and cheques", () => {
    expect(
      collectSchema.safeParse({
        ...base,
        methods: [{ method: "BANK_TRANSFER", amount: 500 }],
      }).success,
    ).toBe(false);
    expect(
      collectSchema.safeParse({
        ...base,
        methods: [{ method: "CHEQUE", amount: 500, reference: "CHQ-77" }],
      }).success,
    ).toBe(true);
  });
  it("rejects zero amounts and repeated methods", () => {
    expect(
      collectSchema.safeParse({
        ...base,
        methods: [{ method: "CASH", amount: 0 }],
      }).success,
    ).toBe(false);
    expect(
      collectSchema.safeParse({
        ...base,
        methods: [
          { method: "CASH", amount: 1 },
          { method: "CASH", amount: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects a future payment date", () => {
    expect(
      collectSchema.safeParse({ ...base, paymentDate: "2999-01-01" }).success,
    ).toBe(false);
  });
});

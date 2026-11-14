import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildCashBook,
  defaultMonths,
  monthBounds,
  monthsBetween,
  BookEntry,
} from "../modules/finance/cashbook.calc";
import { expenseSchema, incomeSchema } from "../modules/finance/finance.schema";
import { validateUpload } from "../modules/finance/uploads";

const D = (n: number) => new Prisma.Decimal(n);
const entry = (
  date: string,
  ref: string,
  amount: number,
  kind: BookEntry["kind"] = "FEE",
): BookEntry => ({
  date,
  at: new Date(`${date}T10:00:00Z`),
  kind,
  ref,
  method: "CASH",
  description: ref,
  amount: D(amount),
});

describe("cash book", () => {
  it("runs a balance from the opening balance and totals in and out", () => {
    const r = buildCashBook(
      [
        entry("2026-11-02", "B", -300, "EXPENSE"),
        entry("2026-11-01", "A", 1000),
        entry("2026-11-03", "C", 500),
      ],
      D(200),
    );
    expect(r.rows.map((x) => x.ref)).toEqual(["A", "B", "C"]);
    expect(r.rows.map((x) => x.balance)).toEqual([
      "1200.00",
      "900.00",
      "1400.00",
    ]);
    expect(r.totals).toEqual({
      opening: "200.00",
      in: "1500.00",
      out: "300.00",
      closing: "1400.00",
    });
  });
  it("shows money in and out in separate columns", () => {
    const [a, b] = buildCashBook(
      [entry("2026-11-01", "A", 100), entry("2026-11-01", "B", -40, "REFUND")],
      D(0),
    ).rows;
    expect([a.moneyIn, a.moneyOut, b.moneyIn, b.moneyOut]).toEqual([
      "100.00",
      null,
      null,
      "40.00",
    ]);
  });
  it("has no rounding drift", () => {
    const r = buildCashBook(
      [entry("2026-11-01", "A", 0.1), entry("2026-11-01", "B", 0.2)],
      D(0),
    );
    expect(r.totals.closing).toBe("0.30");
  });
});

describe("month helpers", () => {
  it("lists months across a year boundary", () =>
    expect(monthsBetween("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]));
  it("finds the first and last day", () => {
    const b = monthBounds("2026-02", "2026-03");
    expect([
      b.from.toISOString().slice(0, 10),
      b.to.toISOString().slice(0, 10),
    ]).toEqual(["2026-02-01", "2026-03-31"]);
  });
  it("defaults to six months", () =>
    expect(
      monthsBetween(
        defaultMonths(new Date("2026-11-15T00:00:00Z")).from,
        "2026-11",
      ),
    ).toHaveLength(6));
});

describe("receipt upload check", () => {
  const pdf = Buffer.from("%PDF-1.4 hello");
  it("accepts a real PDF", () =>
    expect(
      validateUpload({
        originalname: "bill.PDF",
        mimetype: "application/pdf",
        buffer: pdf,
      }),
    ).toEqual({ ext: "pdf" }));
  it("rejects a disguised file", () => {
    expect(
      "error" in
        validateUpload({
          originalname: "bill.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("<script>alert(1)</script>"),
        }),
    ).toBe(true);
  });
  it("rejects a wrong type or extension", () => {
    expect(
      "error" in
        validateUpload({
          originalname: "run.exe",
          mimetype: "application/octet-stream",
          buffer: pdf,
        }),
    ).toBe(true);
    expect(
      "error" in
        validateUpload({
          originalname: "pic.png",
          mimetype: "application/pdf",
          buffer: pdf,
        }),
    ).toBe(true);
  });
  it("accepts a real PNG header", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
    ]);
    expect(
      validateUpload({
        originalname: "a.png",
        mimetype: "image/png",
        buffer: png,
      }),
    ).toEqual({ ext: "png" });
  });
});

describe("expense and income payloads", () => {
  const exp = {
    categoryId: "c",
    description: "Electricity bill October",
    amount: 12500,
    method: "CASH",
  };
  it("accepts a valid expense", () =>
    expect(expenseSchema.safeParse(exp).success).toBe(true));
  it("needs a reference for bank and cheque payments", () => {
    expect(
      expenseSchema.safeParse({ ...exp, method: "BANK_TRANSFER" }).success,
    ).toBe(false);
    expect(
      expenseSchema.safeParse({ ...exp, method: "CHEQUE", reference: "CHQ-5" })
        .success,
    ).toBe(true);
  });
  it("rejects zero amounts and future dates", () => {
    expect(expenseSchema.safeParse({ ...exp, amount: 0 }).success).toBe(false);
    expect(
      expenseSchema.safeParse({ ...exp, expenseDate: "2999-01-01" }).success,
    ).toBe(false);
  });
  it("validates income", () => {
    const inc = {
      source: "DONATION",
      description: "Annual donation",
      amount: 50000,
      method: "CASH",
    };
    expect(incomeSchema.safeParse(inc).success).toBe(true);
    expect(incomeSchema.safeParse({ ...inc, source: "LOTTERY" }).success).toBe(
      false,
    );
  });
});

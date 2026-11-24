import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  addDays,
  borrowBlock,
  daysBetween,
  formatAccession,
  overdueDays,
  overdueFine,
  renewBlock,
  renewedDue,
} from "../modules/library/library.calc";
import {
  bookSchema,
  issueSchema,
  newBookSchema,
  payFineSchema,
  returnSchema,
  settingsSchema,
} from "../modules/library/library.schema";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const D = (n: number) => new Prisma.Decimal(n);

describe("dates and fines", () => {
  it("counts whole days across month ends, ignoring the time of day", () => {
    expect(daysBetween(d("2026-11-28"), d("2026-12-03"))).toBe(5);
    expect(daysBetween(d("2026-11-10"), new Date("2026-11-12T23:30:00Z"))).toBe(
      2,
    );
  });
  it("is overdue only after the due date", () => {
    expect(overdueDays(d("2026-11-10"), d("2026-11-10"))).toBe(0);
    expect(overdueDays(d("2026-11-10"), d("2026-11-09"))).toBe(0);
    expect(overdueDays(d("2026-11-10"), d("2026-11-14"))).toBe(4);
  });
  it("charges the fine per overdue day", () => {
    expect(overdueFine(d("2026-11-10"), d("2026-11-14"), 5).toFixed(2)).toBe(
      "20.00",
    );
    expect(overdueFine(d("2026-11-10"), d("2026-11-10"), 5).toFixed(2)).toBe(
      "0.00",
    );
    expect(overdueFine(d("2026-11-10"), d("2026-11-13"), 2.5).toFixed(2)).toBe(
      "7.50",
    );
  });
  it("adds days and numbers copies", () => {
    expect(addDays(d("2026-11-28"), 14).toISOString().slice(0, 10)).toBe(
      "2026-12-12",
    );
    expect(formatAccession(7)).toBe("LB-000007");
    expect(formatAccession(123456)).toBe("LB-123456");
  });
});

describe("who may borrow", () => {
  const ok = { open: 1, max: 3, overdue: 0, unpaid: D(0) };
  it("allows a borrower in good standing", () =>
    expect(borrowBlock(ok)).toBeNull());
  it("blocks on unpaid fines first, then overdue books, then the limit", () => {
    expect(borrowBlock({ ...ok, unpaid: D(20), overdue: 1, open: 3 })).toMatch(
      /unpaid library fines of 20.00/,
    );
    expect(borrowBlock({ ...ok, overdue: 2 })).toMatch(/2 overdue books/);
    expect(borrowBlock({ ...ok, open: 3 })).toMatch(/limit is 3/);
  });
});

describe("renewing", () => {
  const issue = {
    status: "ISSUED",
    renewals: 0,
    max: 1,
    dueDate: d("2026-11-20"),
  };
  it("allows a renewal that is within the limit and not overdue", () =>
    expect(renewBlock(issue, d("2026-11-18"))).toBeNull());
  it("refuses when over the limit, when overdue, or when the book is not out", () => {
    expect(renewBlock({ ...issue, renewals: 1 }, d("2026-11-18"))).toMatch(
      /most times allowed/,
    );
    expect(renewBlock({ ...issue, max: 0 }, d("2026-11-18"))).toMatch(
      /not allowed/,
    );
    expect(renewBlock(issue, d("2026-11-21"))).toMatch(/overdue/);
    expect(
      renewBlock({ ...issue, status: "RETURNED" }, d("2026-11-18")),
    ).toMatch(/Only books that are out/);
  });
  it("adds one loan period to the due date", () =>
    expect(
      renewedDue(d("2026-11-20"), d("2026-11-18"), 14)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-12-04"));
});

describe("payloads", () => {
  const book = {
    title: "The Lion and the Mouse",
    author: "Aesop",
    categoryId: "c",
  };
  it("normalises an ISBN and rejects a bad one", () => {
    const r = bookSchema.parse({ ...book, isbn: "978-0-306-40615-7" });
    expect(r.isbn).toBe("9780306406157");
    expect(bookSchema.parse({ ...book, isbn: "" }).isbn).toBeNull();
    expect(bookSchema.safeParse({ ...book, isbn: "12345" }).success).toBe(
      false,
    );
    expect(
      bookSchema.safeParse({ ...book, isbn: "0-8044-2957-X" }).success,
    ).toBe(true);
  });
  it("registers with one copy by default and caps copies", () => {
    expect(newBookSchema.parse(book).copies).toBe(1);
    expect(newBookSchema.safeParse({ ...book, copies: 500 }).success).toBe(
      false,
    );
  });
  it("needs a matching borrower and a book or accession number", () => {
    expect(
      issueSchema.safeParse({
        borrowerType: "STUDENT",
        studentId: "s",
        bookId: "b",
      }).success,
    ).toBe(true);
    expect(
      issueSchema.safeParse({
        borrowerType: "STUDENT",
        employeeId: "e",
        bookId: "b",
      }).success,
    ).toBe(false);
    expect(
      issueSchema.safeParse({
        borrowerType: "EMPLOYEE",
        employeeId: "e",
        accessionNo: "LB-000001",
      }).success,
    ).toBe(true);
    expect(
      issueSchema.safeParse({ borrowerType: "STUDENT", studentId: "s" })
        .success,
    ).toBe(false);
  });
  it("validates a return, a fine payment and the rules", () => {
    expect(returnSchema.parse({}).condition).toBe("GOOD");
    expect(returnSchema.safeParse({ condition: "BURNT" }).success).toBe(false);
    expect(
      payFineSchema.safeParse({ paidOn: "2026-11-20", method: "CASH" }).success,
    ).toBe(true);
    expect(
      payFineSchema.safeParse({ paidOn: "2999-01-01", method: "CASH" }).success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        finePerDay: 5,
        loanDaysStudent: 14,
        loanDaysEmployee: 30,
        maxBooksStudent: 3,
        maxBooksEmployee: 5,
        maxRenewals: 1,
      }).success,
    ).toBe(true);
    expect(
      settingsSchema.safeParse({
        finePerDay: -1,
        loanDaysStudent: 14,
        loanDaysEmployee: 30,
        maxBooksStudent: 3,
        maxBooksEmployee: 5,
        maxRenewals: 1,
      }).success,
    ).toBe(false);
  });
});

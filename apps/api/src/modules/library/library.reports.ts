import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { loadSettings, overdueList } from "./library.service";
import { isoDay, overdueDays } from "./library.calc";
import type { LibReportType, ReportQuery } from "./library.schema";

export interface LibReport {
  title: string;
  note?: string;
  columns: { key: string; header: string; kind?: "money"; width?: number }[];
  rows: Record<string, string | number | null>[];
}
const day = (d: Date | null) => (d ? isoDay(d) : "");
const n = (d: Prisma.Decimal) => Number(d.toFixed(2));
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const money = (key: string, header: string) => ({
  key,
  header,
  kind: "money" as const,
  width: 14,
});
const todayUtc = () => new Date(isoDay(new Date()));
const range = (q: ReportQuery) => {
  const to = q.to ?? todayUtc();
  const from = q.from ?? new Date(to.getTime() - 29 * 86_400_000);
  return { from, to };
};

async function register(q: ReportQuery): Promise<LibReport> {
  const { from, to } = range(q);
  const rows = await prisma.libraryIssue.findMany({
    where: {
      issuedOn: { gte: from, lte: to },
      ...(q.borrowerType && { borrowerType: q.borrowerType }),
      ...(q.issueStatus && { status: q.issueStatus }),
      ...(q.categoryId && { copy: { book: { categoryId: q.categoryId } } }),
    },
    orderBy: [{ issuedOn: "asc" }, { issueNo: "asc" }],
    take: 10000,
    include: {
      copy: {
        select: { accessionNo: true, book: { select: { title: true } } },
      },
      student: { select: { fullName: true, admissionNo: true } },
      employee: { select: { fullName: true, employeeNo: true } },
    },
  });
  const today = todayUtc();
  return {
    title: `Library issue and return register ${day(from)} to ${day(to)}`,
    columns: [
      { key: "no", header: "Issue no", width: 16 },
      { key: "issued", header: "Issued", width: 12 },
      { key: "due", header: "Due", width: 12 },
      { key: "returned", header: "Returned", width: 12 },
      { key: "book", header: "Book", width: 30 },
      { key: "acc", header: "Accession", width: 12 },
      { key: "borrower", header: "Borrower", width: 24 },
      { key: "ref", header: "Adm / Emp no", width: 14 },
      { key: "type", header: "Type", width: 10 },
      { key: "status", header: "Status", width: 10 },
      { key: "late", header: "Days late", width: 10 },
    ],
    rows: rows.map((i) => ({
      no: i.issueNo,
      issued: day(i.issuedOn),
      due: day(i.dueDate),
      returned: day(i.returnedOn),
      book: i.copy.book.title,
      acc: i.copy.accessionNo,
      borrower: i.student?.fullName ?? i.employee?.fullName ?? "",
      ref: i.student?.admissionNo ?? i.employee?.employeeNo ?? "",
      type: label(i.borrowerType),
      status: label(i.status),
      late:
        i.status === "ISSUED"
          ? overdueDays(i.dueDate, today)
          : i.returnedOn
            ? overdueDays(i.dueDate, i.returnedOn)
            : 0,
    })),
  };
}

async function overdue(schoolId: string): Promise<LibReport> {
  const rows = await overdueList(schoolId);
  const total = rows.reduce((t, r) => t + Number(r.fineSoFar ?? 0), 0);
  const lines: Record<string, string | number | null>[] = rows.map((r) => ({
    book: r.book.title,
    acc: r.accessionNo,
    borrower: r.borrower.name,
    ref: r.borrower.detail,
    type: label(r.borrowerType),
    due: day(r.dueDate),
    days: r.daysLate,
    fine: Number(r.fineSoFar ?? 0),
    phone: r.phone ?? "",
  }));
  if (lines.length)
    lines.push({
      book: "Total",
      acc: "",
      borrower: "",
      ref: "",
      type: "",
      due: "",
      days: 0,
      fine: Math.round(total * 100) / 100,
      phone: "",
    });
  return {
    title: "Overdue library books",
    columns: [
      { key: "book", header: "Book", width: 30 },
      { key: "acc", header: "Accession", width: 12 },
      { key: "borrower", header: "Borrower", width: 24 },
      { key: "ref", header: "Adm / Emp no", width: 14 },
      { key: "type", header: "Type", width: 10 },
      { key: "due", header: "Was due", width: 12 },
      { key: "days", header: "Days late", width: 10 },
      money("fine", "Fine so far"),
      { key: "phone", header: "Phone", width: 16 },
    ],
    rows: lines,
    note: "The fine so far is charged when the book comes back.",
  };
}

async function fines(q: ReportQuery): Promise<LibReport> {
  const { from, to } = range(q);
  const rows = await prisma.libraryFine.findMany({
    where: {
      createdAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) },
      ...(q.fineStatus && { status: q.fineStatus }),
      ...(q.borrowerType && { borrowerType: q.borrowerType }),
    },
    orderBy: { createdAt: "asc" },
    take: 10000,
    include: {
      student: { select: { fullName: true, admissionNo: true } },
      employee: { select: { fullName: true, employeeNo: true } },
      issue: {
        select: { copy: { select: { book: { select: { title: true } } } } },
      },
    },
  });
  const sum = (st: string) =>
    rows
      .filter((r) => r.status === st)
      .reduce((t, r) => t.plus(r.amount), new Prisma.Decimal(0));
  const lines: Record<string, string | number | null>[] = rows.map((f) => ({
    no: f.fineNo,
    date: day(f.createdAt),
    borrower: f.student?.fullName ?? f.employee?.fullName ?? "",
    ref: f.student?.admissionNo ?? f.employee?.employeeNo ?? "",
    book: f.issue.copy.book.title,
    reason: label(f.reason),
    amount: n(f.amount),
    status: label(f.status),
    paid: day(f.paidOn),
  }));
  if (lines.length) {
    lines.push({
      no: "Collected",
      date: "",
      borrower: "",
      ref: "",
      book: "",
      reason: "",
      amount: n(sum("PAID")),
      status: "",
      paid: "",
    });
    lines.push({
      no: "Outstanding",
      date: "",
      borrower: "",
      ref: "",
      book: "",
      reason: "",
      amount: n(sum("UNPAID")),
      status: "",
      paid: "",
    });
    lines.push({
      no: "Waived",
      date: "",
      borrower: "",
      ref: "",
      book: "",
      reason: "",
      amount: n(sum("WAIVED")),
      status: "",
      paid: "",
    });
  }
  return {
    title: `Library fines ${day(from)} to ${day(to)}`,
    columns: [
      { key: "no", header: "Fine no", width: 16 },
      { key: "date", header: "Date", width: 12 },
      { key: "borrower", header: "Borrower", width: 24 },
      { key: "ref", header: "Adm / Emp no", width: 14 },
      { key: "book", header: "Book", width: 28 },
      { key: "reason", header: "Reason", width: 10 },
      money("amount", "Amount"),
      { key: "status", header: "Status", width: 10 },
      { key: "paid", header: "Paid on", width: 12 },
    ],
    rows: lines,
    note: "Collected fines are in the Cash Book as Other income.",
  };
}

async function popular(q: ReportQuery): Promise<LibReport> {
  const { from, to } = range(q);
  const issues = await prisma.libraryIssue.findMany({
    where: {
      issuedOn: { gte: from, lte: to },
      ...(q.borrowerType && { borrowerType: q.borrowerType }),
      ...(q.categoryId && { copy: { book: { categoryId: q.categoryId } } }),
    },
    take: 20000,
    select: {
      copy: {
        select: {
          book: {
            select: {
              id: true,
              title: true,
              author: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const by = new Map<
    string,
    { title: string; author: string; category: string; count: number }
  >();
  issues.forEach((i) => {
    const b = i.copy.book;
    const e = by.get(b.id) ?? {
      title: b.title,
      author: b.author,
      category: b.category.name,
      count: 0,
    };
    e.count++;
    by.set(b.id, e);
  });
  const top = [...by.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 50);
  return {
    title: `Most borrowed books ${day(from)} to ${day(to)}`,
    columns: [
      { key: "rank", header: "#", width: 6 },
      { key: "title", header: "Book", width: 34 },
      { key: "author", header: "Author", width: 24 },
      { key: "category", header: "Category", width: 16 },
      { key: "times", header: "Times issued", width: 14 },
    ],
    rows: top.map((t, i) => ({
      rank: i + 1,
      title: t.title,
      author: t.author,
      category: t.category,
      times: t.count,
    })),
  };
}

async function lost(q: ReportQuery): Promise<LibReport> {
  const copies = await prisma.bookCopy.findMany({
    where: {
      status: { in: ["LOST", "WITHDRAWN"] },
      ...(q.categoryId && { book: { categoryId: q.categoryId } }),
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
    include: {
      book: { select: { title: true, author: true, price: true } },
      issues: {
        where: { status: "LOST" },
        take: 1,
        orderBy: { updatedAt: "desc" },
        include: {
          student: { select: { fullName: true } },
          employee: { select: { fullName: true } },
          fines: {
            where: { reason: "LOST" },
            select: { amount: true, status: true },
          },
        },
      },
    },
  });
  return {
    title: "Lost and withdrawn books",
    columns: [
      { key: "acc", header: "Accession", width: 12 },
      { key: "title", header: "Book", width: 32 },
      { key: "author", header: "Author", width: 22 },
      { key: "status", header: "Status", width: 12 },
      { key: "date", header: "Date", width: 12 },
      { key: "who", header: "Lost by", width: 22 },
      money("fine", "Fine"),
      { key: "fineStatus", header: "Fine status", width: 12 },
      { key: "note", header: "Note", width: 26 },
    ],
    rows: copies.map((c) => {
      const i = c.issues[0];
      const f = i?.fines[0];
      return {
        acc: c.accessionNo,
        title: c.book.title,
        author: c.book.author,
        status: label(c.status),
        date: day(c.updatedAt),
        who: i ? (i.student?.fullName ?? i.employee?.fullName ?? "") : "",
        fine: f ? n(f.amount) : 0,
        fineStatus: f ? label(f.status) : "",
        note: c.note ?? "",
      };
    }),
  };
}

async function inventory(q: ReportQuery): Promise<LibReport> {
  const cats = await prisma.bookCategory.findMany({
    where: q.categoryId ? { id: q.categoryId } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, _count: { select: { books: true } } },
  });
  const groups = await prisma.bookCopy.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: q.categoryId ? { book: { categoryId: q.categoryId } } : {},
  });
  const per = await prisma.bookCopy.findMany({
    select: { status: true, book: { select: { categoryId: true } } },
    where: q.categoryId ? { book: { categoryId: q.categoryId } } : {},
  });
  const count = (cat: string, st: string) =>
    per.filter((c) => c.book.categoryId === cat && c.status === st).length;
  const rows: Record<string, string | number | null>[] = cats.map((c) => ({
    category: c.name,
    titles: c._count.books,
    copies: per.filter(
      (p) => p.book.categoryId === c.id && p.status !== "WITHDRAWN",
    ).length,
    available: count(c.id, "AVAILABLE"),
    issued: count(c.id, "ISSUED"),
    lost: count(c.id, "LOST"),
    withdrawn: count(c.id, "WITHDRAWN"),
  }));
  const g = (s: string) => groups.find((x) => x.status === s)?._count._all ?? 0;
  if (rows.length)
    rows.push({
      category: "Total",
      titles: rows.reduce((t, r) => t + Number(r.titles), 0),
      copies: g("AVAILABLE") + g("ISSUED") + g("LOST"),
      available: g("AVAILABLE"),
      issued: g("ISSUED"),
      lost: g("LOST"),
      withdrawn: g("WITHDRAWN"),
    });
  return {
    title: "Library inventory by category",
    columns: [
      { key: "category", header: "Category", width: 24 },
      { key: "titles", header: "Titles", width: 10 },
      { key: "copies", header: "Copies", width: 10 },
      { key: "available", header: "On shelf", width: 10 },
      { key: "issued", header: "Issued", width: 10 },
      { key: "lost", header: "Lost", width: 10 },
      { key: "withdrawn", header: "Withdrawn", width: 12 },
    ],
    rows,
    note: "Copies = on shelf + issued + lost. Withdrawn copies are retired and not counted.",
  };
}

export async function buildLibraryReport(
  schoolId: string,
  type: LibReportType,
  q: ReportQuery,
): Promise<LibReport> {
  await loadSettings(schoolId); // fails early if the school is missing
  switch (type) {
    case "register":
      return register(q);
    case "overdue":
      return overdue(schoolId);
    case "fines":
      return fines(q);
    case "popular":
      return popular(q);
    case "lost":
      return lost(q);
    case "inventory":
      return inventory(q);
  }
}

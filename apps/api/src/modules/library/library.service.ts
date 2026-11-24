import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { nextNo } from "../finance/finance.service";
import {
  addDays,
  borrowBlock,
  daysBetween,
  formatAccession,
  isoDay,
  overdueDays,
  overdueFine,
  renewBlock,
  renewedDue,
} from "./library.calc";
import type {
  BookInput,
  BookListQuery,
  CopyListQuery,
  FineListQuery,
  IssueInput,
  IssueListQuery,
  LostInput,
  NewBookInput,
  ReturnInput,
  SettingsInput,
} from "./library.schema";

type Tx = Prisma.TransactionClient;
const OPTS = { timeout: 30_000, maxWait: 10_000 };
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const f2 = (d: Prisma.Decimal) => d.toFixed(2);
const todayUtc = () => new Date(isoDay(new Date()));
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---------------- Library rules (settings) ----------------
const KEYS = {
  finePerDay: "library.finePerDay",
  loanDaysStudent: "library.loanDays.student",
  loanDaysEmployee: "library.loanDays.employee",
  maxBooksStudent: "library.maxBooks.student",
  maxBooksEmployee: "library.maxBooks.employee",
  maxRenewals: "library.maxRenewals",
} as const;
const DEFAULTS = {
  finePerDay: 5,
  loanDaysStudent: 14,
  loanDaysEmployee: 30,
  maxBooksStudent: 3,
  maxBooksEmployee: 5,
  maxRenewals: 1,
};
export type LibrarySettings = typeof DEFAULTS;
const keyList = Object.keys(KEYS) as (keyof typeof KEYS)[];

export async function loadSettings(schoolId: string): Promise<LibrarySettings> {
  const rows = await prisma.schoolSetting.findMany({
    where: { schoolId, key: { in: Object.values(KEYS) } },
  });
  const out = { ...DEFAULTS };
  keyList.forEach((k) => {
    const r = rows.find((x) => x.key === KEYS[k]);
    const n = r ? Number(r.value) : NaN;
    if (!isNaN(n)) out[k] = n;
  });
  return out;
}
export async function saveSettings(schoolId: string, s: SettingsInput) {
  await prisma.$transaction(
    keyList.map((k) =>
      prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key: KEYS[k] } },
        create: { schoolId, key: KEYS[k], value: String(s[k]) },
        update: { value: String(s[k]) },
      }),
    ),
  );
  return s;
}

// ---------------- Books and copies ----------------
async function makeCopies(tx: Tx, bookId: string, count: number) {
  const c = await tx.counter.upsert({
    where: { key: "ACC" },
    create: { key: "ACC", value: count },
    update: { value: { increment: count } },
  });
  const nos = Array.from({ length: count }, (_, i) =>
    formatAccession(c.value - count + 1 + i),
  );
  await tx.bookCopy.createMany({
    data: nos.map((accessionNo) => ({ bookId, accessionNo })),
  });
  return nos;
}

async function checkCategory(categoryId: string) {
  const c = await prisma.bookCategory.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  if (!c) throw ApiError.badRequest("Choose an active category");
}

export async function createBook(input: NewBookInput) {
  await checkCategory(input.categoryId);
  const { copies, ...data } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      const book = await tx.book.create({ data, select: { id: true } });
      return {
        id: book.id,
        accessionNos: copies > 0 ? await makeCopies(tx, book.id, copies) : [],
      };
    }, OPTS);
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict(
        "A book with this ISBN is already registered. Add copies to it instead.",
      );
    throw e;
  }
}

export async function updateBook(id: string, input: BookInput) {
  const b = await prisma.book.findUnique({
    where: { id },
    select: { categoryId: true },
  });
  if (!b) throw ApiError.notFound("Book not found");
  if (input.categoryId !== b.categoryId) await checkCategory(input.categoryId);
  try {
    await prisma.book.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("Another book already has this ISBN");
    throw e;
  }
  return { id };
}

export async function addCopies(bookId: string, count: number) {
  const b = await prisma.book.findUnique({
    where: { id: bookId },
    select: { isActive: true },
  });
  if (!b) throw ApiError.notFound("Book not found");
  if (!b.isActive)
    throw ApiError.conflict("This book is inactive. Reactivate it first.");
  return {
    accessionNos: await prisma.$transaction(
      (tx) => makeCopies(tx, bookId, count),
      OPTS,
    ),
  };
}

export async function listBooks(q: BookListQuery) {
  const where: Prisma.BookWhereInput = {
    ...(q.categoryId && { categoryId: q.categoryId }),
    ...(q.status && { isActive: q.status === "ACTIVE" }),
    ...(q.availability === "available" && {
      copies: { some: { status: "AVAILABLE" } },
    }),
    ...(q.availability === "none" && {
      copies: { none: { status: "AVAILABLE" } },
    }),
    ...(q.q && {
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { author: { contains: q.q, mode: "insensitive" } },
        { isbn: { contains: q.q.replace(/-/g, "") } },
        { publisher: { contains: q.q, mode: "insensitive" } },
        {
          copies: {
            some: { accessionNo: { contains: q.q, mode: "insensitive" } },
          },
        },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.book.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ title: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.book.count({ where }),
  ]);
  const groups = await prisma.bookCopy.groupBy({
    by: ["bookId", "status"],
    _count: { _all: true },
    where: { bookId: { in: rows.map((r) => r.id) } },
  });
  const n = (id: string, st: string) =>
    groups.find((g) => g.bookId === id && g.status === st)?._count._all ?? 0;
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map((b) => ({
      id: b.id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      edition: b.edition,
      publishedYear: b.publishedYear,
      language: b.language,
      category: b.category,
      shelfLocation: b.shelfLocation,
      price: b.price ? f2(b.price) : null,
      description: b.description,
      isActive: b.isActive,
      available: n(b.id, "AVAILABLE"),
      issued: n(b.id, "ISSUED"),
      lost: n(b.id, "LOST"),
      withdrawn: n(b.id, "WITHDRAWN"),
      copies: n(b.id, "AVAILABLE") + n(b.id, "ISSUED"), // copies in the library's hands
    })),
  };
}

export async function listCopies(q: CopyListQuery) {
  const where: Prisma.BookCopyWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.bookId && { bookId: q.bookId }),
    ...(q.categoryId && { book: { categoryId: q.categoryId } }),
    ...(q.q && {
      OR: [
        { accessionNo: { contains: q.q, mode: "insensitive" } },
        { book: { title: { contains: q.q, mode: "insensitive" } } },
        { book: { author: { contains: q.q, mode: "insensitive" } } },
        { book: { isbn: { contains: q.q.replace(/-/g, "") } } },
      ],
    }),
  };
  const [rows, total, groups] = await prisma.$transaction([
    prisma.bookCopy.findMany({
      where,
      orderBy: [{ accessionNo: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            shelfLocation: true,
            category: { select: { name: true } },
          },
        },
        issues: {
          where: { status: "ISSUED" },
          take: 1,
          include: {
            student: { select: { fullName: true, admissionNo: true } },
            employee: { select: { fullName: true, employeeNo: true } },
          },
        },
      },
    }),
    prisma.bookCopy.count({ where }),
    prisma.bookCopy.groupBy({
      by: ["status"],
      orderBy: { status: "asc" },
      _count: { _all: true },
    }),
  ]);
  const count = (s: string) =>
    groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    summary: {
      available: count("AVAILABLE"),
      issued: count("ISSUED"),
      lost: count("LOST"),
      withdrawn: count("WITHDRAWN"),
    },
    items: rows.map((c) => {
      const i = c.issues[0];
      return {
        id: c.id,
        accessionNo: c.accessionNo,
        status: c.status,
        note: c.note,
        book: c.book,
        borrower: i
          ? {
              name: i.student?.fullName ?? i.employee?.fullName ?? "",
              detail: i.student?.admissionNo ?? i.employee?.employeeNo ?? "",
              dueDate: i.dueDate,
            }
          : null,
      };
    }),
  };
}

export async function withdrawCopy(id: string, note?: string) {
  const r = await prisma.bookCopy.updateMany({
    where: { id, status: "AVAILABLE" },
    data: { status: "WITHDRAWN", note: note ?? null },
  });
  if (r.count === 0)
    throw ApiError.conflict("Only copies on the shelf can be withdrawn");
  return { id };
}
export async function restoreCopy(id: string, note?: string) {
  const r = await prisma.bookCopy.updateMany({
    where: { id, status: { in: ["WITHDRAWN", "LOST"] } },
    data: { status: "AVAILABLE", note: note ?? null },
  });
  if (r.count === 0)
    throw ApiError.conflict(
      "Only withdrawn or lost copies can be put back on the shelf",
    );
  return { id };
}

// ---------------- Borrowers ----------------
export async function searchBorrowers(type: "STUDENT" | "EMPLOYEE", q: string) {
  if (type === "STUDENT") {
    const rows = await prisma.student.findMany({
      where: {
        status: "ACTIVE",
        archivedAt: null,
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { admissionNo: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        admissionNo: true,
        fullName: true,
        enrollments: {
          where: { status: "ENROLLED" },
          orderBy: { session: { startDate: "desc" } },
          take: 1,
          select: {
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.fullName,
      detail: `${s.admissionNo}${s.enrollments[0] ? ` · ${s.enrollments[0].class.name} ${s.enrollments[0].section.name}` : ""}`,
    }));
  }
  const rows = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { employeeNo: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      employeeNo: true,
      fullName: true,
      designation: { select: { name: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.fullName,
    detail: `${e.employeeNo} · ${e.designation.name}`,
  }));
}

const whereBorrower = (type: "STUDENT" | "EMPLOYEE", id: string) =>
  type === "STUDENT" ? { studentId: id } : { employeeId: id };
const issueInclude = {
  copy: {
    select: {
      accessionNo: true,
      book: { select: { id: true, title: true, author: true } },
    },
  },
  student: { select: { id: true, fullName: true, admissionNo: true } },
  employee: {
    select: { id: true, fullName: true, employeeNo: true, phone: true },
  },
};
type IssueRow = Prisma.LibraryIssueGetPayload<{ include: typeof issueInclude }>;

const issueShape = (i: IssueRow, perDay: number, today: Date) => {
  const late =
    i.status === "ISSUED"
      ? overdueDays(i.dueDate, today)
      : i.returnedOn
        ? overdueDays(i.dueDate, i.returnedOn)
        : 0;
  return {
    id: i.id,
    issueNo: i.issueNo,
    status: i.status,
    issuedOn: i.issuedOn,
    dueDate: i.dueDate,
    returnedOn: i.returnedOn,
    renewals: i.renewals,
    returnNote: i.returnNote,
    book: {
      id: i.copy.book.id,
      title: i.copy.book.title,
      author: i.copy.book.author,
    },
    accessionNo: i.copy.accessionNo,
    borrowerType: i.borrowerType,
    borrower: i.student
      ? {
          id: i.student.id,
          name: i.student.fullName,
          detail: i.student.admissionNo,
        }
      : {
          id: i.employee!.id,
          name: i.employee!.fullName,
          detail: i.employee!.employeeNo,
        },
    daysLate: late,
    fineSoFar: i.status === "ISSUED" ? f2(D(perDay).mul(late)) : null,
  };
};

export async function borrowerSummary(
  schoolId: string,
  type: "STUDENT" | "EMPLOYEE",
  id: string,
) {
  const settings = await loadSettings(schoolId);
  const today = todayUtc();
  const where = whereBorrower(type, id);
  const [issues, fines, person] = await Promise.all([
    prisma.libraryIssue.findMany({
      where,
      include: issueInclude,
      orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    prisma.libraryFine.findMany({
      where: { ...where, status: "UNPAID" },
      select: { id: true, fineNo: true, reason: true, amount: true },
    }),
    type === "STUDENT"
      ? prisma.student.findUnique({
          where: { id },
          select: { fullName: true, admissionNo: true },
        })
      : prisma.employee.findUnique({
          where: { id },
          select: { fullName: true, employeeNo: true },
        }),
  ]);
  if (!person) throw ApiError.notFound("Borrower not found");
  const open = issues.filter((i) => i.status === "ISSUED");
  return {
    person: {
      name: person.fullName,
      detail: "admissionNo" in person ? person.admissionNo : person.employeeNo,
    },
    limits: {
      max:
        type === "STUDENT"
          ? settings.maxBooksStudent
          : settings.maxBooksEmployee,
      loanDays:
        type === "STUDENT"
          ? settings.loanDaysStudent
          : settings.loanDaysEmployee,
      maxRenewals: settings.maxRenewals,
    },
    open: open.map((i) => issueShape(i, settings.finePerDay, today)),
    history: issues
      .filter((i) => i.status !== "ISSUED")
      .map((i) => issueShape(i, settings.finePerDay, today)),
    unpaid: {
      total: f2(fines.reduce((t, x) => t.plus(x.amount), D(0))),
      items: fines.map((x) => ({
        id: x.id,
        fineNo: x.fineNo,
        reason: x.reason,
        amount: f2(x.amount),
      })),
    },
  };
}

// ---------------- Issue, return, renew, lost ----------------
async function createFine(
  tx: Tx,
  issue: {
    id: string;
    borrowerType: "STUDENT" | "EMPLOYEE";
    studentId: string | null;
    employeeId: string | null;
  },
  reason: "OVERDUE" | "LOST" | "DAMAGED",
  amount: Prisma.Decimal,
  date: Date,
  note?: string,
) {
  return tx.libraryFine.create({
    data: {
      fineNo: await nextNo(tx, "LF", date),
      issueId: issue.id,
      borrowerType: issue.borrowerType,
      studentId: issue.studentId,
      employeeId: issue.employeeId,
      reason,
      amount,
      note,
    },
    select: { id: true, fineNo: true },
  });
}

export async function issueBook(
  schoolId: string,
  userId: string,
  input: IssueInput,
) {
  const settings = await loadSettings(schoolId);
  const today = todayUtc();
  const issuedOn = input.issuedOn ?? today;
  const isStudent = input.borrowerType === "STUDENT";

  if (isStudent) {
    if (
      !(await prisma.student.findFirst({
        where: { id: input.studentId!, status: "ACTIVE", archivedAt: null },
        select: { id: true },
      }))
    )
      throw ApiError.badRequest("Choose an active student");
  } else if (
    !(await prisma.employee.findFirst({
      where: { id: input.employeeId!, status: "ACTIVE" },
      select: { id: true },
    }))
  )
    throw ApiError.badRequest("Choose an active staff member");

  const where = whereBorrower(
    input.borrowerType,
    (isStudent ? input.studentId : input.employeeId)!,
  );
  const [open, unpaid] = await Promise.all([
    prisma.libraryIssue.findMany({
      where: { ...where, status: "ISSUED" },
      select: { dueDate: true, copy: { select: { bookId: true } } },
    }),
    prisma.libraryFine.aggregate({
      _sum: { amount: true },
      where: { ...where, status: "UNPAID" },
    }),
  ]);
  const block = borrowBlock({
    open: open.length,
    max: isStudent ? settings.maxBooksStudent : settings.maxBooksEmployee,
    overdue: open.filter((o) => daysBetween(o.dueDate, today) > 0).length,
    unpaid: unpaid._sum.amount ?? D(0),
  });
  if (block) throw ApiError.conflict(block);

  const include = { book: { select: { title: true, isActive: true } } };
  const copy = input.accessionNo
    ? await prisma.bookCopy.findUnique({
        where: { accessionNo: input.accessionNo.trim().toUpperCase() },
        include,
      })
    : await prisma.bookCopy.findFirst({
        where: { bookId: input.bookId!, status: "AVAILABLE" },
        orderBy: { accessionNo: "asc" },
        include,
      });
  if (!copy)
    throw input.accessionNo
      ? ApiError.notFound("No copy has that accession number")
      : ApiError.conflict("No copy of this book is available right now");
  if (copy.status !== "AVAILABLE")
    throw ApiError.conflict(
      `Copy ${copy.accessionNo} is ${copy.status.toLowerCase()}, not on the shelf`,
    );
  if (!copy.book.isActive) throw ApiError.conflict("This book is inactive");
  if (open.some((o) => o.copy.bookId === copy.bookId))
    throw ApiError.conflict("This borrower already has a copy of this book");

  const due =
    input.dueDate ??
    addDays(
      issuedOn,
      isStudent ? settings.loanDaysStudent : settings.loanDaysEmployee,
    );
  if (due < issuedOn)
    throw ApiError.badRequest("The due date is before the issue date");

  return prisma.$transaction(async (tx) => {
    // Claiming the copy is atomic, so two people cannot issue the same copy.
    const claim = await tx.bookCopy.updateMany({
      where: { id: copy.id, status: "AVAILABLE" },
      data: { status: "ISSUED" },
    });
    if (claim.count === 0)
      throw ApiError.conflict("Someone just issued this copy. Choose another.");
    const issue = await tx.libraryIssue.create({
      data: {
        issueNo: await nextNo(tx, "LIB", issuedOn),
        copyId: copy.id,
        borrowerType: input.borrowerType,
        studentId: input.studentId ?? null,
        employeeId: input.employeeId ?? null,
        issuedOn,
        dueDate: due,
        issuedById: userId,
      },
      select: { id: true, issueNo: true, dueDate: true },
    });
    return { ...issue, title: copy.book.title, accessionNo: copy.accessionNo };
  }, OPTS);
}

export async function returnBook(
  schoolId: string,
  userId: string,
  issueId: string,
  input: ReturnInput,
) {
  const settings = await loadSettings(schoolId);
  const issue = await prisma.libraryIssue.findUnique({
    where: { id: issueId },
    include: { copy: { select: { id: true } } },
  });
  if (!issue) throw ApiError.notFound("Issue not found");
  if (issue.status !== "ISSUED")
    throw ApiError.conflict("This book is not out");
  const on = input.returnedOn ?? todayUtc();
  if (on < issue.issuedOn)
    throw ApiError.badRequest("The return date is before the issue date");

  const days = overdueDays(issue.dueDate, on);
  const late = overdueFine(issue.dueDate, on, settings.finePerDay);
  const damage =
    input.condition === "DAMAGED" ? D(input.damageFine ?? 0) : D(0);
  return prisma.$transaction(async (tx) => {
    const done = await tx.libraryIssue.updateMany({
      where: { id: issueId, status: "ISSUED" },
      data: {
        status: "RETURNED",
        returnedOn: on,
        returnedById: userId,
        returnNote: input.note ?? null,
      },
    });
    if (done.count === 0)
      throw ApiError.conflict("This book was just returned");
    await tx.bookCopy.update({
      where: { id: issue.copy.id },
      data:
        input.condition === "DAMAGED"
          ? { status: "WITHDRAWN", note: "Damaged on return" }
          : { status: "AVAILABLE" },
    });
    const fines: { fineNo: string; reason: string; amount: string }[] = [];
    if (late.gt(0))
      fines.push({
        ...(await createFine(
          tx,
          issue,
          "OVERDUE",
          late,
          on,
          `${days} day(s) late`,
        )),
        reason: "OVERDUE",
        amount: f2(late),
      });
    if (damage.gt(0))
      fines.push({
        ...(await createFine(tx, issue, "DAMAGED", damage, on, input.note)),
        reason: "DAMAGED",
        amount: f2(damage),
      });
    return {
      id: issueId,
      daysLate: days,
      fines,
      copyRetired: input.condition === "DAMAGED",
    };
  }, OPTS);
}

export async function renewIssue(schoolId: string, issueId: string) {
  const settings = await loadSettings(schoolId);
  const issue = await prisma.libraryIssue.findUnique({
    where: { id: issueId },
  });
  if (!issue) throw ApiError.notFound("Issue not found");
  const today = todayUtc();
  const block = renewBlock(
    {
      status: issue.status,
      renewals: issue.renewals,
      max: settings.maxRenewals,
      dueDate: issue.dueDate,
    },
    today,
  );
  if (block) throw ApiError.conflict(block);
  const days =
    issue.borrowerType === "STUDENT"
      ? settings.loanDaysStudent
      : settings.loanDaysEmployee;
  const dueDate = renewedDue(issue.dueDate, today, days);
  const r = await prisma.libraryIssue.updateMany({
    where: { id: issueId, status: "ISSUED", renewals: issue.renewals },
    data: { dueDate, renewals: { increment: 1 } },
  });
  if (r.count === 0)
    throw ApiError.conflict("This loan just changed. Reload and try again.");
  return { id: issueId, dueDate };
}

export async function markLost(
  userId: string,
  issueId: string,
  input: LostInput,
) {
  const issue = await prisma.libraryIssue.findUnique({
    where: { id: issueId },
    include: {
      copy: { select: { id: true, book: { select: { price: true } } } },
    },
  });
  if (!issue) throw ApiError.notFound("Issue not found");
  if (issue.status !== "ISSUED")
    throw ApiError.conflict("This book is not out");
  const amount =
    input.fineAmount !== undefined
      ? D(input.fineAmount)
      : issue.copy.book.price;
  if (amount === null)
    throw ApiError.badRequest(
      "Enter the replacement amount. This book has no price recorded.",
    );
  const today = todayUtc();
  return prisma.$transaction(async (tx) => {
    const done = await tx.libraryIssue.updateMany({
      where: { id: issueId, status: "ISSUED" },
      data: {
        status: "LOST",
        returnedOn: today,
        returnedById: userId,
        returnNote: input.note ?? "Reported lost",
      },
    });
    if (done.count === 0) throw ApiError.conflict("This loan just changed");
    await tx.bookCopy.update({
      where: { id: issue.copy.id },
      data: { status: "LOST", note: input.note ?? "Reported lost" },
    });
    const fine = amount.gt(0)
      ? await createFine(tx, issue, "LOST", amount, today, input.note)
      : null;
    return { id: issueId, fineNo: fine?.fineNo ?? null, amount: f2(amount) };
  }, OPTS);
}

export async function lookupOpenIssue(schoolId: string, accessionNo: string) {
  const settings = await loadSettings(schoolId);
  const copy = await prisma.bookCopy.findUnique({
    where: { accessionNo: accessionNo.trim().toUpperCase() },
    select: { id: true, status: true, book: { select: { title: true } } },
  });
  if (!copy) throw ApiError.notFound("No copy has that accession number");
  const issue = await prisma.libraryIssue.findFirst({
    where: { copyId: copy.id, status: "ISSUED" },
    include: issueInclude,
  });
  if (!issue)
    throw ApiError.conflict(
      `${copy.book.title} (${accessionNo.toUpperCase()}) is not out. It is ${copy.status.toLowerCase()}.`,
    );
  return issueShape(issue, settings.finePerDay, todayUtc());
}

export async function listIssues(schoolId: string, q: IssueListQuery) {
  const settings = await loadSettings(schoolId);
  const where: Prisma.LibraryIssueWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.borrowerType && { borrowerType: q.borrowerType }),
    ...((q.from || q.to) && {
      issuedOn: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) },
    }),
    ...(q.q && {
      OR: [
        { issueNo: { contains: q.q, mode: "insensitive" } },
        { copy: { accessionNo: { contains: q.q, mode: "insensitive" } } },
        { copy: { book: { title: { contains: q.q, mode: "insensitive" } } } },
        { student: { fullName: { contains: q.q, mode: "insensitive" } } },
        { student: { admissionNo: { contains: q.q, mode: "insensitive" } } },
        { employee: { fullName: { contains: q.q, mode: "insensitive" } } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.libraryIssue.findMany({
      where,
      include: issueInclude,
      orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.libraryIssue.count({ where }),
  ]);
  const today = todayUtc();
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map((i) => issueShape(i, settings.finePerDay, today)),
  };
}

/** Books past their due date, with a phone to chase (a parent's for students). */
export async function overdueList(schoolId: string, withPhone = true) {
  const settings = await loadSettings(schoolId);
  const today = todayUtc();
  const rows = await prisma.libraryIssue.findMany({
    where: { status: "ISSUED", dueDate: { lt: today } },
    include: issueInclude,
    orderBy: [{ dueDate: "asc" }],
    take: 2000,
  });
  const guardians =
    withPhone && rows.length
      ? await prisma.studentGuardian.findMany({
          where: {
            studentId: {
              in: rows.map((r) => r.studentId).filter((x): x is string => !!x),
            },
          },
          orderBy: { isPrimary: "desc" },
          include: { guardian: { select: { fullName: true, phone: true } } },
        })
      : [];
  return rows.map((i) => {
    const g = i.studentId
      ? guardians.find((x) => x.studentId === i.studentId)?.guardian
      : null;
    return {
      ...issueShape(i, settings.finePerDay, today),
      phone: i.student ? (g?.phone ?? null) : (i.employee?.phone ?? null),
      contactName: i.student
        ? (g?.fullName ?? null)
        : (i.employee?.fullName ?? null),
    };
  });
}

// ---------------- Fines ----------------
const fineInclude = {
  student: { select: { fullName: true, admissionNo: true } },
  employee: { select: { fullName: true, employeeNo: true } },
  issue: {
    select: {
      issueNo: true,
      copy: {
        select: { accessionNo: true, book: { select: { title: true } } },
      },
    },
  },
};
export async function listFines(q: FineListQuery) {
  const where: Prisma.LibraryFineWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.reason && { reason: q.reason }),
    ...((q.from || q.to) && {
      createdAt: {
        ...(q.from && { gte: q.from }),
        ...(q.to && { lt: new Date(q.to.getTime() + 86_400_000) }),
      },
    }),
    ...(q.q && {
      OR: [
        { fineNo: { contains: q.q, mode: "insensitive" } },
        { student: { fullName: { contains: q.q, mode: "insensitive" } } },
        { student: { admissionNo: { contains: q.q, mode: "insensitive" } } },
        { employee: { fullName: { contains: q.q, mode: "insensitive" } } },
        {
          issue: {
            copy: { book: { title: { contains: q.q, mode: "insensitive" } } },
          },
        },
      ],
    }),
  };
  const [rows, total, unpaid] = await prisma.$transaction([
    prisma.libraryFine.findMany({
      where,
      include: fineInclude,
      orderBy: [{ createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.libraryFine.count({ where }),
    prisma.libraryFine.aggregate({
      _sum: { amount: true },
      where: { ...where, status: "UNPAID" },
    }),
  ]);
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    unpaidTotal: f2(unpaid._sum.amount ?? D(0)),
    items: rows.map((f) => ({
      id: f.id,
      fineNo: f.fineNo,
      reason: f.reason,
      amount: f2(f.amount),
      status: f.status,
      note: f.note,
      createdAt: f.createdAt,
      paidOn: f.paidOn,
      paymentMethod: f.paymentMethod,
      waiveReason: f.waiveReason,
      borrower: f.student
        ? { name: f.student.fullName, detail: f.student.admissionNo }
        : {
            name: f.employee?.fullName ?? "",
            detail: f.employee?.employeeNo ?? "",
          },
      book: f.issue.copy.book.title,
      accessionNo: f.issue.copy.accessionNo,
      issueNo: f.issue.issueNo,
    })),
  };
}

const REASON_TEXT = {
  OVERDUE: "overdue book",
  LOST: "lost book",
  DAMAGED: "damaged book",
};

/** Collecting a fine and booking it as income happen together. */
export async function payFine(
  id: string,
  input: { paidOn: Date; method: PaymentMethod; reference?: string },
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const f = await tx.libraryFine.findUnique({
      where: { id },
      include: {
        student: { select: { fullName: true } },
        employee: { select: { fullName: true } },
      },
    });
    if (!f) throw ApiError.notFound("Fine not found");
    const claim = await tx.libraryFine.updateMany({
      where: { id, status: "UNPAID" },
      data: {
        status: "PAID",
        paidOn: input.paidOn,
        paymentMethod: input.method,
        receivedById: userId,
      },
    });
    if (claim.count === 0)
      throw ApiError.conflict(`This fine is already ${f.status.toLowerCase()}`);
    const name = f.student?.fullName ?? f.employee?.fullName ?? "";
    const income = await tx.otherIncome.create({
      data: {
        incomeNo: await nextNo(tx, "INC", input.paidOn),
        incomeDate: input.paidOn,
        source: "OTHER",
        description: `Library fine ${f.fineNo} (${REASON_TEXT[f.reason]})`,
        receivedFrom: name,
        method: input.method,
        reference: input.reference ?? f.fineNo,
        amount: f.amount,
        createdById: userId,
      },
      select: { id: true, incomeNo: true },
    });
    await tx.libraryFine.update({
      where: { id },
      data: { incomeId: income.id },
    });
    return { id, fineNo: f.fineNo, incomeNo: income.incomeNo };
  }, OPTS);
}

export async function waiveFine(id: string, reason: string, userId: string) {
  const r = await prisma.libraryFine.updateMany({
    where: { id, status: "UNPAID" },
    data: { status: "WAIVED", waiveReason: reason, waivedById: userId },
  });
  if (r.count === 0) throw ApiError.conflict("Only unpaid fines can be waived");
  return { id };
}

export async function reverseFinePayment(id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const f = await tx.libraryFine.findUnique({ where: { id } });
    if (!f) throw ApiError.notFound("Fine not found");
    if (f.status !== "PAID")
      throw ApiError.conflict("Only paid fines can be reversed");
    if (f.incomeId)
      await tx.otherIncome.updateMany({
        where: { id: f.incomeId, status: "ACTIVE" },
        data: {
          status: "VOIDED",
          voidReason: `Library fine ${f.fineNo} payment reversed: ${reason}`,
          voidedAt: new Date(),
        },
      });
    await tx.libraryFine.update({
      where: { id },
      data: {
        status: "UNPAID",
        paidOn: null,
        paymentMethod: null,
        receivedById: null,
        incomeId: null,
      },
    });
    return { id, fineNo: f.fineNo };
  }, OPTS);
}

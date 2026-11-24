import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";
import { METHODS } from "../payroll/payroll.schema";

const id = z.string().min(1);
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime() + 86_400_000;
const money = z.coerce.number().min(0).max(1_000_000);
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const isbn = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined
      : v
        ? v.replace(/[-\s]/g, "").toUpperCase()
        : null,
  )
  .refine(
    (v) => v === undefined || v === null || /^(\d{9}[\dX]|\d{13})$/.test(v),
    "Enter a valid 10 or 13 digit ISBN",
  );

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(999).optional(),
  ),
  isActive: z.boolean().optional(),
});

export const bookSchema = z.object({
  isbn,
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(150),
  publisher: clearable(120),
  edition: clearable(40),
  publishedYear: z.preprocess(
    emptyToUndef,
    z.coerce
      .number()
      .int()
      .min(1000)
      .max(new Date().getFullYear() + 1)
      .optional(),
  ),
  language: clearable(40),
  categoryId: id,
  shelfLocation: clearable(60),
  price: z.preprocess(emptyToUndef, money.optional()),
  description: clearable(1000),
  isActive: z.boolean().optional(),
});
export const newBookSchema = bookSchema.extend({
  copies: z.coerce.number().int().min(0).max(200).default(1),
});
export type BookInput = z.infer<typeof bookSchema>;
export type NewBookInput = z.infer<typeof newBookSchema>;
export const addCopiesSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
});

export const bookListSchema = z.object({
  q: opt(100),
  categoryId: optId,
  availability: optEnum(["available", "none"] as const),
  status: optEnum(["ACTIVE", "INACTIVE"] as const),
  ...page,
});
export type BookListQuery = z.infer<typeof bookListSchema>;
export const copyListSchema = z.object({
  q: opt(100),
  status: optEnum(["AVAILABLE", "ISSUED", "LOST", "WITHDRAWN"] as const),
  bookId: optId,
  categoryId: optId,
  ...page,
});
export type CopyListQuery = z.infer<typeof copyListSchema>;
export const noteSchema = z.object({ note: opt(200) });

export const borrowerSearchSchema = z.object({
  type: z.enum(["STUDENT", "EMPLOYEE"]),
  q: z.string().trim().min(2),
});
export const borrowerParamSchema = z.object({
  type: z.enum(["STUDENT", "EMPLOYEE"]),
  id,
});

export const issueSchema = z
  .object({
    borrowerType: z.enum(["STUDENT", "EMPLOYEE"]),
    studentId: optId,
    employeeId: optId,
    bookId: optId,
    accessionNo: opt(30),
    issuedOn: z.preprocess(
      emptyToUndef,
      z.coerce
        .date()
        .refine(notFuture, "The date cannot be in the future")
        .optional(),
    ),
    dueDate: optDate,
  })
  .superRefine((v, ctx) => {
    if (v.borrowerType === "STUDENT" && !v.studentId)
      ctx.addIssue({
        code: "custom",
        path: ["studentId"],
        message: "Choose a student",
      });
    if (v.borrowerType === "EMPLOYEE" && !v.employeeId)
      ctx.addIssue({
        code: "custom",
        path: ["employeeId"],
        message: "Choose a staff member",
      });
    if (!v.bookId && !v.accessionNo)
      ctx.addIssue({
        code: "custom",
        path: ["bookId"],
        message: "Choose a book or enter an accession number",
      });
  });
export type IssueInput = z.infer<typeof issueSchema>;

export const returnSchema = z.object({
  returnedOn: z.preprocess(
    emptyToUndef,
    z.coerce
      .date()
      .refine(notFuture, "The date cannot be in the future")
      .optional(),
  ),
  condition: z.enum(["GOOD", "DAMAGED"]).default("GOOD"),
  damageFine: z.preprocess(emptyToUndef, money.optional()),
  note: opt(200),
});
export type ReturnInput = z.infer<typeof returnSchema>;
export const lostSchema = z.object({
  fineAmount: z.preprocess(emptyToUndef, money.optional()),
  note: opt(200),
});
export type LostInput = z.infer<typeof lostSchema>;
export const lookupSchema = z.object({ accessionNo: z.string().trim().min(3) });

export const issueListSchema = z.object({
  status: optEnum(["ISSUED", "RETURNED", "LOST"] as const),
  borrowerType: optEnum(["STUDENT", "EMPLOYEE"] as const),
  q: opt(100),
  from: optDate,
  to: optDate,
  ...page,
});
export type IssueListQuery = z.infer<typeof issueListSchema>;

export const fineListSchema = z.object({
  status: optEnum(["UNPAID", "PAID", "WAIVED"] as const),
  reason: optEnum(["OVERDUE", "LOST", "DAMAGED"] as const),
  q: opt(100),
  from: optDate,
  to: optDate,
  ...page,
});
export type FineListQuery = z.infer<typeof fineListSchema>;
export const payFineSchema = z.object({
  paidOn: z.coerce.date().refine(notFuture, "The date cannot be in the future"),
  method: z.enum(METHODS),
  reference: opt(80),
});
export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const settingsSchema = z.object({
  finePerDay: z.coerce.number().min(0).max(10_000),
  loanDaysStudent: z.coerce.number().int().min(1).max(90),
  loanDaysEmployee: z.coerce.number().int().min(1).max(180),
  maxBooksStudent: z.coerce.number().int().min(1).max(20),
  maxBooksEmployee: z.coerce.number().int().min(1).max(50),
  maxRenewals: z.coerce.number().int().min(0).max(5),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const LIB_REPORTS = [
  "register",
  "overdue",
  "fines",
  "popular",
  "lost",
  "inventory",
] as const;
export type LibReportType = (typeof LIB_REPORTS)[number];
export const reportParamSchema = z.object({ type: z.enum(LIB_REPORTS) });
export const reportQuerySchema = z.object({
  from: optDate,
  to: optDate,
  borrowerType: optEnum(["STUDENT", "EMPLOYEE"] as const),
  categoryId: optId,
  issueStatus: optEnum(["ISSUED", "RETURNED", "LOST"] as const),
  fineStatus: optEnum(["UNPAID", "PAID", "WAIVED"] as const),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";
import { money } from "../fees/fees.schema";
import { period } from "../fees/invoices.schema";
import { METHODS } from "../fees/payments.schema";

const NEEDS_REFERENCE = new Set([
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CHEQUE",
]);
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime() + 86_400_000;

function referenceRule(
  v: { method: string; reference?: string },
  ctx: z.RefinementCtx,
) {
  if (NEEDS_REFERENCE.has(v.method) && !v.reference) {
    ctx.addIssue({
      code: "custom",
      path: ["reference"],
      message: "Enter the transaction or cheque reference",
    });
  }
}

const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// ---- Expenses ----
export const expenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(999).optional(),
  ),
  isActive: z.boolean().optional(),
});

export const expenseSchema = z
  .object({
    categoryId: z.string().min(1),
    description: z.string().trim().min(3).max(300),
    amount: money.refine((v) => v > 0, "Enter an amount above 0"),
    expenseDate: z.coerce
      .date()
      .default(todayUtc)
      .refine(notFuture, "The date cannot be in the future"),
    method: z.enum(METHODS),
    paidTo: opt(120),
    reference: opt(60),
  })
  .superRefine(referenceRule);
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseListSchema = z.object({
  q: opt(100),
  categoryId: optId,
  method: optEnum(METHODS),
  status: optEnum(["PENDING", "APPROVED", "REJECTED", "VOIDED"] as const),
  from: optDate,
  to: optDate,
  ...pageFields,
});
export type ExpenseListQuery = z.infer<typeof expenseListSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

// ---- Other income ----
const SOURCES = ["DONATION", "TRANSPORT", "RENTAL", "EVENT", "OTHER"] as const;
export const incomeSchema = z
  .object({
    source: z.enum(SOURCES),
    description: z.string().trim().min(3).max(300),
    amount: money.refine((v) => v > 0, "Enter an amount above 0"),
    incomeDate: z.coerce
      .date()
      .default(todayUtc)
      .refine(notFuture, "The date cannot be in the future"),
    method: z.enum(METHODS),
    receivedFrom: opt(120),
    reference: opt(60),
  })
  .superRefine(referenceRule);
export type IncomeInput = z.infer<typeof incomeSchema>;

export const incomeListSchema = z.object({
  q: opt(100),
  source: optEnum(SOURCES),
  status: optEnum(["ACTIVE", "VOIDED"] as const),
  from: optDate,
  to: optDate,
  ...pageFields,
});
export type IncomeListQuery = z.infer<typeof incomeListSchema>;

// ---- Ledger and reports ----
export const cashBookSchema = z.object({
  from: optDate,
  to: optDate,
  account: z.enum(["ALL", "CASH", "NON_CASH"]).default("ALL"),
});
export type CashBookQuery = z.infer<typeof cashBookSchema>;

export const monthRangeSchema = z.object({
  from: z.preprocess(emptyToUndef, period.optional()),
  to: z.preprocess(emptyToUndef, period.optional()),
});
export type MonthRangeQuery = z.infer<typeof monthRangeSchema>;

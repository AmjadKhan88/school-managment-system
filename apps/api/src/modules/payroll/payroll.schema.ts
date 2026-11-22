import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";
import { period } from "../fees/invoices.schema";

export const METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CHEQUE",
  "OTHER",
] as const;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime() + 86_400_000;
const amount = z.coerce
  .number()
  .positive("Enter an amount above zero")
  .max(100_000_000);
const nonNeg = z.coerce.number().min(0).max(100_000_000);
const sort = z.preprocess(
  emptyToUndef,
  z.coerce.number().int().min(0).max(999).optional(),
);
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// ---------------- Structure ----------------
export const componentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(["ALLOWANCE", "DEDUCTION"]),
  isPercent: z.boolean().default(false),
  sortOrder: sort,
  isActive: z.boolean().optional(),
});
export const structureListSchema = z.object({
  q: opt(100),
  departmentId: optId,
  status: z.preprocess(
    emptyToUndef,
    z.enum(["ACTIVE", "ALL"]).default("ACTIVE"),
  ),
  ...page,
});
export type StructureListQuery = z.infer<typeof structureListSchema>;
export const structureSchema = z
  .object({
    basicSalary: amount,
    items: z
      .array(z.object({ componentId: z.string().min(1), value: nonNeg }))
      .max(40),
  })
  .superRefine((v, ctx) => {
    const ids = v.items.map((i) => i.componentId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "A component is listed twice",
      });
  });
export type StructureInput = z.infer<typeof structureSchema>;

// ---------------- Payroll ----------------
export const runListSchema = z.object({ period });
export const generateSchema = z.object({ period });
export const approveSchema = z.object({
  period,
  ids: z.array(z.string().min(1)).max(1000).optional(),
});
export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

const halfSteps = (n: number) => Math.round(n * 2) / 2 === n;
export const draftEditSchema = z
  .object({
    bonus: z.preprocess(emptyToUndef, nonNeg.default(0)),
    bonusNote: opt(150),
    overtimeHours: z.preprocess(
      emptyToUndef,
      z.coerce.number().min(0).max(300).default(0),
    ),
    overtimeRate: z.preprocess(emptyToUndef, nonNeg.optional()),
    absenceDays: z.preprocess(
      emptyToUndef,
      z.coerce
        .number()
        .min(0)
        .max(31)
        .refine(halfSteps, "Use whole or half days")
        .optional(),
    ),
    absenceNote: opt(200),
  })
  .superRefine((v, ctx) => {
    if (v.absenceDays !== undefined && !v.absenceNote)
      ctx.addIssue({
        code: "custom",
        path: ["absenceNote"],
        message: "Give a reason for changing the absence days",
      });
  });
export type DraftEdit = z.infer<typeof draftEditSchema>;

// ---------------- Payments ----------------
export const paymentSchema = z.object({
  payrollId: z.string().min(1),
  amount,
  paidOn: z.coerce.date().refine(notFuture, "The date cannot be in the future"),
  method: z.enum(METHODS),
  reference: opt(80),
  note: opt(200),
});
export type PaymentInput = z.infer<typeof paymentSchema>;
export const paymentListSchema = z.object({
  period: z.preprocess(emptyToUndef, period.optional()),
  from: optDate,
  to: optDate,
  method: optEnum(METHODS),
  employeeId: optId,
  ...page,
});
export type PaymentListQuery = z.infer<typeof paymentListSchema>;
export const slipQuerySchema = z.object({ period, payrollId: optId });

// ---------------- Loans ----------------
export const loanSchema = z
  .object({
    employeeId: z.string().min(1, "Choose an employee"),
    type: z.enum(["ADVANCE", "LOAN"]),
    amount,
    instalments: z.coerce.number().int().min(1).max(60),
    startPeriod: period,
    reason: opt(200),
  })
  .superRefine((v, ctx) => {
    if (v.type === "ADVANCE" && v.instalments > 12)
      ctx.addIssue({
        code: "custom",
        path: ["instalments"],
        message: "An advance can be recovered over at most 12 months",
      });
  });
export type LoanInput = z.infer<typeof loanSchema>;
export const loanApproveSchema = z.object({
  issuedOn: z.coerce
    .date()
    .refine(notFuture, "The date cannot be in the future"),
  method: z.enum(METHODS),
  reference: opt(80),
});
export const loanListSchema = z.object({
  type: optEnum(["ADVANCE", "LOAN"] as const),
  status: optEnum([
    "PENDING",
    "ACTIVE",
    "SETTLED",
    "REJECTED",
    "CANCELLED",
  ] as const),
  q: opt(100),
  ...page,
});
export type LoanListQuery = z.infer<typeof loanListSchema>;
export const employeeSearchSchema = z.object({ q: z.string().trim().min(2) });

// ---------------- Reports ----------------
export const PAY_REPORTS = ["register", "payments", "loans"] as const;
export type PayReportType = (typeof PAY_REPORTS)[number];
export const payReportParamSchema = z.object({ type: z.enum(PAY_REPORTS) });
export const payReportQuerySchema = z.object({
  period: z.preprocess(emptyToUndef, period.optional()),
  from: optDate,
  to: optDate,
  method: optEnum(METHODS),
  departmentId: optId,
  status: optEnum([
    "PENDING",
    "ACTIVE",
    "SETTLED",
    "REJECTED",
    "CANCELLED",
  ] as const),
});
export type PayReportQuery = z.infer<typeof payReportQuerySchema>;

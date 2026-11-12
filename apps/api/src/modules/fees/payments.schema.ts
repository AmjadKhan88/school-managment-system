import { z } from "zod";
import { opt, optDate, optEnum, optId } from "../../utils/zodHelpers";
import { money } from "./fees.schema";

export const METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CHEQUE",
  "OTHER",
] as const;
const NEEDS_REFERENCE = new Set([
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CHEQUE",
]);

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
// One day of slack so a user ahead of UTC can still record "today".
const notInFuture = (d: Date) =>
  d.getTime() <= todayUtc().getTime() + 86_400_000;

export const collectSchema = z
  .object({
    studentId: z.string().min(1),
    paymentDate: z.coerce
      .date()
      .default(todayUtc)
      .refine(notInFuture, "Payment date cannot be in the future"),
    methods: z
      .array(
        z.object({
          method: z.enum(METHODS),
          amount: money,
          reference: opt(60),
        }),
      )
      .min(1)
      .max(4),
    invoiceIds: z.array(z.string().min(1)).max(60).optional(),
    allowAdvance: z.boolean().default(false),
    notes: opt(300),
    idempotencyKey: z.string().min(8).max(64).optional(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.methods.forEach((m, i) => {
      if (m.amount <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["methods", i, "amount"],
          message: "Enter an amount above 0",
        });
      if (NEEDS_REFERENCE.has(m.method) && !m.reference)
        ctx.addIssue({
          code: "custom",
          path: ["methods", i, "reference"],
          message: "Enter the transaction or cheque reference",
        });
      if (seen.has(m.method))
        ctx.addIssue({
          code: "custom",
          path: ["methods", i, "method"],
          message: "Each payment method can be used once",
        });
      seen.add(m.method);
    });
    if (v.invoiceIds && new Set(v.invoiceIds).size !== v.invoiceIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["invoiceIds"],
        message: "An invoice is selected twice",
      });
    }
  });
export type CollectInput = z.infer<typeof collectSchema>;

export const reverseSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
export const applyCreditSchema = z.object({ studentId: z.string().min(1) });
export const studentParam = z.object({ studentId: z.string().min(1) });
export const searchSchema = z.object({ q: z.string().trim().min(2) });

export const paymentListSchema = z.object({
  studentId: optId,
  q: opt(100),
  from: optDate,
  to: optDate,
  method: optEnum(METHODS),
  status: optEnum(["POSTED", "REVERSED"] as const),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentListQuery = z.infer<typeof paymentListSchema>;

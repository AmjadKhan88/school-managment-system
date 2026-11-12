import { z } from "zod";
import { opt, optEnum } from "../../utils/zodHelpers";
import { money } from "./fees.schema";
import { METHODS } from "./payments.schema";

const NEEDS_REFERENCE = new Set([
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CHEQUE",
]);

export const refundRequestSchema = z
  .object({
    studentId: z.string().min(1),
    amount: money.refine((v) => v > 0, "Enter an amount above 0"),
    method: z.enum(METHODS),
    reference: opt(60),
    reason: z.string().trim().min(3, "Give a reason").max(300),
  })
  .superRefine((v, ctx) => {
    if (NEEDS_REFERENCE.has(v.method) && !v.reference)
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter the transaction or cheque reference",
      });
  });
export type RefundRequest = z.infer<typeof refundRequestSchema>;

export const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const refundListSchema = z.object({
  q: opt(100),
  status: optEnum(["PENDING", "PAID", "REJECTED"] as const),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RefundListQuery = z.infer<typeof refundListSchema>;

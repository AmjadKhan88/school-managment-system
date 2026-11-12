import { z } from "zod";
import { emptyToUndef, opt, optEnum, optId } from "../../utils/zodHelpers";
import { money } from "./fees.schema";
import { period } from "./invoices.schema";

export const discountSchema = z
  .object({
    enrollmentId: z.string().min(1),
    kind: z.enum(["DISCOUNT", "SCHOLARSHIP"]),
    categoryId: optId,
    mode: z.enum(["PERCENT", "FIXED"]),
    value: money,
    validFromPeriod: z.preprocess(emptyToUndef, period.optional()),
    validToPeriod: z.preprocess(emptyToUndef, period.optional()),
    reason: z.string().trim().min(3, "Give a reason").max(200),
  })
  .superRefine((v, ctx) => {
    if (v.value <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a value above 0",
      });
    if (v.mode === "PERCENT" && v.value > 100)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A percentage cannot exceed 100",
      });
    if (
      v.validFromPeriod &&
      v.validToPeriod &&
      v.validFromPeriod > v.validToPeriod
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validToPeriod"],
        message: "End month is before the start month",
      });
    }
  });
export type DiscountInput = z.infer<typeof discountSchema>;

export const discountListSchema = z.object({
  sessionId: optId,
  kind: optEnum(["DISCOUNT", "SCHOLARSHIP"] as const),
  status: optEnum(["PENDING", "APPROVED", "REVOKED"] as const),
  q: opt(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DiscountListQuery = z.infer<typeof discountListSchema>;

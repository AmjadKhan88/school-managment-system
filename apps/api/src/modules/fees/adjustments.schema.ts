import { z } from "zod";
import { opt, optEnum } from "../../utils/zodHelpers";
import { money } from "./fees.schema";

export const adjustmentSchema = z.object({
  invoiceId: z.string().min(1),
  type: z.enum(["FINE_WAIVER", "EXTRA_DISCOUNT"]),
  amount: money.refine((v) => v > 0, "Enter an amount above 0"),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const adjustmentListSchema = z.object({
  q: opt(100),
  type: optEnum(["FINE_WAIVER", "EXTRA_DISCOUNT"] as const),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdjustmentListQuery = z.infer<typeof adjustmentListSchema>;

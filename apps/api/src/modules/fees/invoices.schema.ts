import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";
import { periodRegex } from "./invoices.calc";

export const period = z.string().regex(periodRegex, "Use the format YYYY-MM");

export const generateSchema = z
  .object({
    sessionId: z.string().min(1),
    periodKey: period,
    classId: optId,
    sectionId: optId,
    enrollmentIds: z.array(z.string().min(1)).max(500).optional(),
    includeOneTime: z.boolean().default(true),
    dryRun: z.boolean().default(false),
  })
  .refine((v) => v.classId || (v.enrollmentIds && v.enrollmentIds.length > 0), {
    message: "Choose a class or select students",
    path: ["classId"],
  });
export type GenerateInput = z.infer<typeof generateSchema>;

export const invoiceListSchema = z.object({
  sessionId: optId,
  periodKey: z.preprocess(emptyToUndef, period.optional()),
  classId: optId,
  sectionId: optId,
  status: optEnum(["OPEN", "PARTIAL", "PAID", "CANCELLED"] as const),
  q: opt(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InvoiceListQuery = z.infer<typeof invoiceListSchema>;

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const applyFinesSchema = z.object({
  sessionId: optId,
  asOfDate: optDate,
});

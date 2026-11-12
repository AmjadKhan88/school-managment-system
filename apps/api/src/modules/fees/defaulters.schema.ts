import { z } from "zod";
import { emptyToUndef, opt, optId } from "../../utils/zodHelpers";
import { period } from "./invoices.schema";

export const defaultersQuerySchema = z.object({
  sessionId: optId,
  classId: optId,
  sectionId: optId,
  periodKey: z.preprocess(emptyToUndef, period.optional()),
  minOutstanding: z.preprocess(
    emptyToUndef,
    z.coerce.number().min(0).max(9_999_999).default(0),
  ),
  q: opt(100),
  sortBy: z.enum(["outstanding", "oldest", "name"]).default("outstanding"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DefaultersQuery = z.infer<typeof defaultersQuerySchema>;

export const reminderLogSchema = z.object({
  studentId: z.string().min(1),
  phone: opt(30),
  message: z.string().trim().min(5).max(1000),
});

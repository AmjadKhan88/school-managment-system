import { z } from "zod";
import { emptyToUndef, opt, optDate, optId } from "../../utils/zodHelpers";
import { period } from "../fees/invoices.schema";

export const STATUSES = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "LEAVE",
  "HALF_DAY",
] as const;

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
// One day of slack so a user ahead of UTC can still record "today".
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime() + 86_400_000;

export const registerQuerySchema = z.object({
  sessionId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  date: z.coerce.date(),
});
export type RegisterQuery = z.infer<typeof registerQuerySchema>;

export const saveRegisterSchema = z
  .object({
    sessionId: z.string().min(1),
    classId: z.string().min(1),
    sectionId: z.string().min(1),
    date: z.coerce.date().refine(notFuture, "The date cannot be in the future"),
    entries: z
      .array(
        z.object({
          enrollmentId: z.string().min(1),
          status: z.enum(STATUSES),
          remarks: opt(200),
        }),
      )
      .min(1)
      .max(300),
  })
  .superRefine((v, ctx) => {
    const ids = v.entries.map((e) => e.enrollmentId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "A student appears twice",
      });
  });
export type SaveRegister = z.infer<typeof saveRegisterSchema>;

export const REPORT_TYPES = [
  "daily",
  "monthly",
  "absentees",
  "late",
  "low",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const reportParamSchema = z.object({ type: z.enum(REPORT_TYPES) });

export const reportQuerySchema = z.object({
  sessionId: optId,
  classId: optId,
  sectionId: optId,
  date: optDate,
  month: z.preprocess(emptyToUndef, period.optional()),
  from: optDate,
  to: optDate,
  threshold: z.preprocess(
    emptyToUndef,
    z.coerce.number().min(1).max(100).default(75),
  ),
  minDays: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(200).default(5),
  ),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

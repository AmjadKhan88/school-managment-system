import { z } from "zod";
import { emptyToUndef, opt, optDate, optId } from "../../utils/zodHelpers";
import { STATUSES } from "../attendance/attendance.schema";
import { TIME_RE } from "../exams/exams.calc";
import { period } from "../fees/invoices.schema";

export const GROUPS = ["teachers", "staff"] as const;
export type Group = (typeof GROUPS)[number];

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime() + 86_400_000;
const time = z.preprocess(
  emptyToUndef,
  z.string().regex(TIME_RE, "Use the format HH:MM").optional(),
);

export const staffRegisterQuerySchema = z.object({
  date: z.coerce.date(),
  group: z.enum(GROUPS),
  departmentId: optId,
});
export type StaffRegisterQuery = z.infer<typeof staffRegisterQuerySchema>;

export const saveStaffRegisterSchema = z
  .object({
    date: z.coerce.date().refine(notFuture, "The date cannot be in the future"),
    group: z.enum(GROUPS),
    entries: z
      .array(
        z.object({
          employeeId: z.string().min(1),
          status: z.enum(STATUSES),
          checkIn: time,
          checkOut: time,
          remarks: opt(200),
        }),
      )
      .min(1)
      .max(500),
  })
  .superRefine((v, ctx) => {
    const ids = v.entries.map((e) => e.employeeId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "An employee appears twice",
      });
    v.entries.forEach((e, i) => {
      if (e.checkIn && e.checkOut && e.checkOut <= e.checkIn)
        ctx.addIssue({
          code: "custom",
          path: ["entries", i, "checkOut"],
          message: "Check-out must be after check-in",
        });
    });
  });
export type SaveStaffRegister = z.infer<typeof saveStaffRegisterSchema>;

export const STAFF_REPORT_TYPES = [
  "daily",
  "monthly",
  "absentees",
  "late",
] as const;
export type StaffReportType = (typeof STAFF_REPORT_TYPES)[number];
export const staffReportParamSchema = z.object({
  type: z.enum(STAFF_REPORT_TYPES),
});
export const staffReportQuerySchema = z.object({
  group: z.preprocess(emptyToUndef, z.enum(GROUPS).optional()),
  departmentId: optId,
  date: optDate,
  month: z.preprocess(emptyToUndef, period.optional()),
  from: optDate,
  to: optDate,
});
export type StaffReportQuery = z.infer<typeof staffReportQuerySchema>;

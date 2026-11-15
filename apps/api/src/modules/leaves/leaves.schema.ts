import { z } from "zod";
import { opt, optDate, optEnum, optId } from "../../utils/zodHelpers";
import { leaveDays } from "./leave.calc";

const TYPES = ["SICK", "CASUAL", "EMERGENCY", "FAMILY", "OTHER"] as const;
const day = 86_400_000;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));

export const leaveSchema = z
  .object({
    studentId: z.string().min(1, "Choose a student"),
    leaveType: z.enum(TYPES),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z
      .string()
      .trim()
      .min(5, "Give a reason of at least 5 characters")
      .max(500),
  })
  .superRefine((v, ctx) => {
    const today = todayUtc().getTime();
    if (v.endDate < v.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date is before the start date",
      });
    else if (leaveDays(v.startDate, v.endDate) > 60)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Leave can be at most 60 days",
      });
    if (v.startDate.getTime() < today - 30 * day)
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Leave cannot start more than 30 days ago",
      });
    if (v.startDate.getTime() > today + 365 * day)
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Leave cannot start more than a year ahead",
      });
  });
export type LeaveInput = z.infer<typeof leaveSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const leaveListSchema = z.object({
  q: opt(100),
  status: optEnum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const),
  type: optEnum(TYPES),
  classId: optId,
  from: optDate, // leave that overlaps this range
  to: optDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type LeaveListQuery = z.infer<typeof leaveListSchema>;

export const searchSchema = z.object({ q: z.string().trim().min(2) });

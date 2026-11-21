import { z } from "zod";
import { opt, optDate, optEnum, optId } from "../../utils/zodHelpers";
import { leaveDays } from "../leaves/leave.calc";

export const STAFF_LEAVE_TYPES = [
  "SICK",
  "CASUAL",
  "ANNUAL",
  "EMERGENCY",
  "FAMILY",
  "MATERNITY",
  "UNPAID",
  "OTHER",
] as const;
const day = 86_400_000;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));

export const staffLeaveSchema = z
  .object({
    employeeId: optId, // omitted = the signed-in user's own employee record
    leaveType: z.enum(STAFF_LEAVE_TYPES),
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
export type StaffLeaveInput = z.infer<typeof staffLeaveSchema>;

export const staffLeaveListSchema = z.object({
  q: opt(100),
  status: optEnum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const),
  type: optEnum(STAFF_LEAVE_TYPES),
  employeeId: optId,
  from: optDate,
  to: optDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type StaffLeaveListQuery = z.infer<typeof staffLeaveListSchema>;

export const employeeSearchSchema = z.object({ q: z.string().trim().min(2) });

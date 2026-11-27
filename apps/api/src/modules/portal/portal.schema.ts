import { z } from "zod";

const id = z.string().min(1);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

// ---- Portal data (students and parents) ----
export const childQuerySchema = z.object({ studentId: id });
export const attendanceQuerySchema = childQuerySchema.extend({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the form YYYY-MM")
    .optional(),
});
export const reportCardQuerySchema = childQuerySchema.extend({ examId: id });
export const cancelLeaveSchema = z.object({ studentId: id });

// ---- Login accounts (staff side) ----
export const kindParamSchema = z.object({
  kind: z.enum(["student", "guardian"]),
  id,
});
export const createLoginSchema = z.object({ email });
export const activeLoginSchema = z.object({ isActive: z.boolean() });

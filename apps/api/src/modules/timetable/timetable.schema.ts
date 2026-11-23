import { z } from "zod";
import { emptyToUndef, optId } from "../../utils/zodHelpers";
import { TIME_RE } from "../exams/exams.calc";

const id = z.string().min(1);
const nullableId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null);
const weekOf = z.preprocess(emptyToUndef, z.coerce.date().optional());
const time = z.string().regex(TIME_RE, "Use the format HH:MM");
const day = 86_400_000;

export const sessionQuerySchema = z.object({ sessionId: id });

export const configSchema = z
  .object({
    sessionId: id,
    workingDays: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(1, "Choose at least one working day")
      .max(7),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.workingDays).size !== v.workingDays.length)
      ctx.addIssue({
        code: "custom",
        path: ["workingDays"],
        message: "A day is listed twice",
      });
  });

export const periodSchema = z.object({
  sessionId: id,
  name: z.string().trim().min(1).max(40),
  startTime: time,
  endTime: time,
  isBreak: z.boolean().default(false),
});
export const periodUpdateSchema = periodSchema.omit({ sessionId: true });
export type PeriodInput = z.infer<typeof periodSchema>;

export const roomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  capacity: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(500).optional(),
  ),
  isActive: z.boolean().optional(),
});

export const entrySchema = z.object({
  sessionId: id,
  sectionId: id,
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  periodId: id,
  subjectId: id,
  employeeId: nullableId,
  roomId: nullableId,
});
export type EntryInput = z.infer<typeof entrySchema>;

export const classQuerySchema = z.object({
  sessionId: id,
  sectionId: id,
  weekOf,
});
export const teacherQuerySchema = z.object({
  sessionId: id,
  employeeId: optId,
  weekOf,
});
export const optionsQuerySchema = z.object({ sessionId: id, sectionId: id });
export const coverQuerySchema = z
  .object({ sessionId: id, from: z.coerce.date(), to: z.coerce.date() })
  .superRefine((v, ctx) => {
    if (v.to < v.from)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date is before the start date",
      });
    else if ((v.to.getTime() - v.from.getTime()) / day > 31)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Choose at most 31 days",
      });
  });
export const printQuerySchema = z.object({
  sessionId: id,
  type: z.enum(["class", "teacher"]),
  classId: optId,
  sectionId: optId,
  employeeId: optId,
});
export type PrintQuery = z.infer<typeof printQuerySchema>;

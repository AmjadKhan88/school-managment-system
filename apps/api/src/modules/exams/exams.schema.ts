import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";
import { TIME_RE } from "./exams.calc";

export const EXAM_TYPES = [
  "MONTHLY_TEST",
  "WEEKLY_TEST",
  "MIDTERM",
  "FINAL",
  "PRACTICAL",
  "ANNUAL",
] as const;

const marks = z.coerce
  .number()
  .int()
  .min(1, "Marks must be at least 1")
  .max(1000);
const day = 86_400_000;

// ---------------- Grading ----------------
export const scaleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  isActive: z.boolean().optional(),
  bands: z
    .array(
      z.object({
        grade: z.string().trim().min(1).max(8),
        minPercent: z.coerce.number().min(0).max(100),
        gradePoint: z.coerce.number().min(0).max(10),
        remark: opt(60),
      }),
    )
    .min(1)
    .max(15),
});
export type ScaleInput = z.infer<typeof scaleSchema>;

// ---------------- Exams ----------------
export const examSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    type: z.enum(EXAM_TYPES),
    sessionId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    gradingScaleId: optId,
    notes: opt(300),
    classes: z
      .array(
        z.object({
          classId: z.string().min(1),
          totalMarks: marks,
          passingMarks: z.coerce.number().int().min(0).max(1000),
        }),
      )
      .min(1, "Choose at least one class")
      .max(40),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date is before the start date",
      });
    else if ((v.endDate.getTime() - v.startDate.getTime()) / day > 120)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "An exam can run for at most 120 days",
      });
    const ids = v.classes.map((c) => c.classId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["classes"],
        message: "A class is listed twice",
      });
    v.classes.forEach((c, i) => {
      if (c.passingMarks > c.totalMarks)
        ctx.addIssue({
          code: "custom",
          path: ["classes", i, "passingMarks"],
          message: "Passing marks cannot exceed total marks",
        });
    });
  });
export type ExamInput = z.infer<typeof examSchema>;

export const examListSchema = z.object({
  sessionId: optId,
  status: optEnum(["DRAFT", "PUBLISHED", "COMPLETED"] as const),
  type: optEnum(EXAM_TYPES),
});

export const statusSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]),
});

const time = z.preprocess(
  emptyToUndef,
  z.string().regex(TIME_RE, "Use the format HH:MM").optional(),
);
export const scheduleQuerySchema = z.object({ classId: z.string().min(1) });
export const dateSheetQuerySchema = z.object({ classId: optId });

export const scheduleSchema = z
  .object({
    classId: z.string().min(1),
    rows: z
      .array(
        z.object({
          subjectId: z.string().min(1),
          examDate: optDate,
          startTime: time,
          endTime: time,
          room: opt(40),
          totalMarks: marks,
          practicalMarks: z.coerce.number().int().min(0).max(1000).default(0),
          passingMarks: z.coerce.number().int().min(0).max(1000),
        }),
      )
      .min(1)
      .max(40),
  })
  .superRefine((v, ctx) => {
    const ids = v.rows.map((r) => r.subjectId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["rows"],
        message: "A subject is listed twice",
      });
    v.rows.forEach((r, i) => {
      const at = (k: string, message: string) =>
        ctx.addIssue({ code: "custom", path: ["rows", i, k], message });
      if (r.examDate && (!r.startTime || !r.endTime))
        at("startTime", "Enter the start and end time for a dated paper");
      if ((r.startTime && !r.endTime) || (!r.startTime && r.endTime))
        at("endTime", "Enter both start and end time");
      if (r.startTime && r.endTime && r.endTime <= r.startTime)
        at("endTime", "The end time must be after the start time");
      if (r.startTime && !r.examDate)
        at("examDate", "Choose the date for this paper");
      if (r.passingMarks > r.totalMarks)
        at("passingMarks", "Passing marks cannot exceed total marks");
      if (r.practicalMarks > r.totalMarks)
        at("practicalMarks", "Practical marks cannot exceed total marks");
    });
  });
export type ScheduleInput = z.infer<typeof scheduleSchema>;

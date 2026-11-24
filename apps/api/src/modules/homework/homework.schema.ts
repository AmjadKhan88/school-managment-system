import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";

const id = z.string().min(1);
const day = 86_400_000;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
/** Multipart sends lists and flags as text, so accept a JSON list (or comma separated ids) and "true"/"false". */
const idList = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v.split(",").filter(Boolean);
  }
}, z.array(id).min(1, "Choose at least one section").max(20));
const flag = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v),
  z.boolean().default(true),
);
const marks = z.preprocess(
  emptyToUndef,
  z.coerce.number().int().min(1).max(1000).optional(),
);

export const sessionQuerySchema = z.object({ sessionId: optId });
export const idsParamSchema = z.object({ id, studentId: id });

export const homeworkSchema = z
  .object({
    sessionId: id,
    sectionIds: idList,
    subjectId: id,
    employeeId: optId,
    title: z.string().trim().min(3, "Give the homework a title").max(120),
    description: opt(2000),
    assignedOn: z.coerce.date(),
    dueDate: z.coerce.date(),
    maxMarks: marks,
    allowLate: flag,
  })
  .superRefine((v, ctx) => {
    const today = todayUtc().getTime();
    if (v.dueDate < v.assignedOn)
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "The due date is before the assigned date",
      });
    else if ((v.dueDate.getTime() - v.assignedOn.getTime()) / day > 120)
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "The due date can be at most 120 days after it is assigned",
      });
    if (v.assignedOn.getTime() < today - 7 * day)
      ctx.addIssue({
        code: "custom",
        path: ["assignedOn"],
        message: "Homework cannot be assigned more than 7 days ago",
      });
    if (v.assignedOn.getTime() > today + 30 * day)
      ctx.addIssue({
        code: "custom",
        path: ["assignedOn"],
        message: "Homework cannot be assigned more than 30 days ahead",
      });
  });
export type HomeworkInput = z.infer<typeof homeworkSchema>;

export const homeworkEditSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  dueDate: z.coerce.date(),
  maxMarks: z.number().int().min(1).max(1000).nullable().optional(),
  allowLate: z.boolean(),
});
export type HomeworkEdit = z.infer<typeof homeworkEditSchema>;

export const listSchema = z.object({
  sessionId: optId,
  classId: optId,
  sectionId: optId,
  subjectId: optId,
  employeeId: optId,
  status: optEnum(["ACTIVE", "CANCELLED"] as const),
  q: opt(100),
  from: optDate,
  to: optDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listSchema>;

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const reviewSchema = z
  .object({
    status: z.enum(["CHECKED", "REDO"]),
    marks: z.number().min(0).max(1000).nullable().optional(),
    feedback: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((v, ctx) => {
    if (v.status === "REDO" && !v.feedback)
      ctx.addIssue({
        code: "custom",
        path: ["feedback"],
        message: "Tell the student what to redo",
      });
    if (v.status === "REDO" && v.marks !== null && v.marks !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["marks"],
        message: "Marks are given when the work is checked",
      });
  });
export type ReviewInput = z.infer<typeof reviewSchema>;

export const recordSchema = z.object({
  note: opt(500),
  submittedOn: z.preprocess(emptyToUndef, z.coerce.date().optional()),
});
export const portalQuerySchema = z.object({ studentId: id });
export const portalSubmitSchema = z.object({ studentId: id, note: opt(500) });

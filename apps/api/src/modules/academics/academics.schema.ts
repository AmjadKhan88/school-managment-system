import { z } from "zod";

const date = z.coerce.date();
export const sessionSchema = z
  .object({
    name: z.string().trim().min(3).max(20),
    startDate: date,
    endDate: date,
  })
  .refine((v) => v.endDate > v.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });

export const classSchema = z.object({
  name: z.string().trim().min(1).max(40),
  level: z.coerce.number().int().min(1).max(30),
  isActive: z.boolean().optional(),
});

export const sectionSchema = z.object({
  classId: z.string().min(1),
  name: z.string().trim().min(1).max(20),
  capacity: z.coerce.number().int().min(1).max(200).default(40),
  isActive: z.boolean().optional(),
});

export const subjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().toUpperCase().min(2).max(12),
  isActive: z.boolean().optional(),
});

export const classSubjectsSchema = z.object({
  subjectIds: z.array(z.string().min(1)),
});
export const idParam = z.object({ id: z.string().min(1) });

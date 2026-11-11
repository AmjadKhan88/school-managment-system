import { z } from "zod";
import { emptyToUndef, opt, optEnum } from "../../utils/zodHelpers";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2),
  sessionId: z.string().min(1),
});

const common = {
  studentId: z.string().min(1),
  sessionId: z.string().min(1),
  transferDate: z.coerce.date().default(() => new Date()),
  reason: opt(300),
};

export const internalSchema = z.object({
  ...common,
  toClassId: z.string().min(1),
  toSectionId: z.string().min(1),
  rollNo: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(999).optional(),
  ),
});
export type InternalInput = z.infer<typeof internalSchema>;

export const outSchema = z.object({
  ...common,
  destinationSchool: opt(150),
});
export type OutInput = z.infer<typeof outSchema>;

export const historyQuerySchema = z.object({
  q: opt(100),
  type: optEnum(["INTERNAL", "OUT"] as const),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

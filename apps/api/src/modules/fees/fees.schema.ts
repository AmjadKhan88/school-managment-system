import { z } from "zod";
import { emptyToUndef, opt, optEnum, optId } from "../../utils/zodHelpers";

const FREQ = ["MONTHLY", "ONE_TIME", "YEARLY"] as const;
const FINES = ["NONE", "FIXED", "PER_DAY"] as const;

/** Money in, rounded to 2 decimals. Stored as Decimal(14,2) in the database. */
export const money = z.coerce
  .number({ invalid_type_error: "Enter an amount" })
  .min(0, "Amount cannot be negative")
  .max(9_999_999.99, "Amount is too large")
  .transform((n) => Math.round(n * 100) / 100);

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z.string().trim().toUpperCase().min(2).max(12),
  frequency: z.enum(FREQ),
  sortOrder: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(999).optional(),
  ),
  isActive: z.boolean().optional(),
});

export const sessionQuerySchema = z.object({ sessionId: z.string().min(1) });

export const structureSchema = z
  .object({
    sessionId: z.string().min(1),
    classId: z.string().min(1),
    dueDay: z.coerce
      .number()
      .int()
      .min(1, "Due day must be 1 to 28")
      .max(28, "Due day must be 1 to 28")
      .default(10),
    fineType: z.enum(FINES).default("NONE"),
    fineAmount: money.default(0),
    graceDays: z.coerce.number().int().min(0).max(60).default(0),
    items: z
      .array(z.object({ categoryId: z.string().min(1), amount: money }))
      .min(1, "Add at least one fee")
      .max(20),
  })
  .superRefine((v, ctx) => {
    const ids = v.items.map((i) => i.categoryId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "A fee category is listed twice",
      });
    if (v.fineType !== "NONE" && v.fineAmount <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["fineAmount"],
        message: "Enter the fine amount",
      });
  });
export type StructureInput = z.infer<typeof structureSchema>;

export const copySchema = z
  .object({
    fromSessionId: z.string().min(1),
    toSessionId: z.string().min(1),
    increasePercent: z.coerce.number().min(0).max(100).default(0),
  })
  .refine((v) => v.fromSessionId !== v.toSessionId, {
    message: "Choose two different sessions",
    path: ["toSessionId"],
  });

export const assignmentsQuerySchema = z.object({
  sessionId: z.string().min(1),
  classId: optId,
  sectionId: optId,
  assigned: optEnum(["true", "false"] as const),
  q: opt(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AssignmentsQuery = z.infer<typeof assignmentsQuerySchema>;

export const assignmentUpdateSchema = z.object({
  overrides: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        amount: money,
        reason: z
          .string()
          .trim()
          .max(200)
          .optional()
          .transform((v) => v || undefined),
      }),
    )
    .max(20)
    .default([]),
});

export const bulkAssignSchema = z.object({
  sessionId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: optId,
});

export const enrollmentParam = z.object({ enrollmentId: z.string().min(1) });

import { z } from "zod";
import { emptyToUndef, opt, optId } from "../../utils/zodHelpers";

const ids = {
  examId: z.string().min(1),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
};
export const gridQuerySchema = z.object(ids);
export const progressQuerySchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
});

const mark = z.preprocess(
  emptyToUndef,
  z.coerce.number().min(0).max(1000).optional(),
);

export const saveGridSchema = z
  .object({
    ...ids,
    entries: z
      .array(
        z.object({
          enrollmentId: z.string().min(1),
          status: z.enum(["ENTERED", "ABSENT", "EXEMPT"]).nullable(), // null = no mark for this student
          theory: mark,
          practical: mark,
          remarks: opt(200),
        }),
      )
      .min(1)
      .max(300),
  })
  .superRefine((v, ctx) => {
    const e = v.entries.map((x) => x.enrollmentId);
    if (new Set(e).size !== e.length)
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "A student appears twice",
      });
  });
export type SaveGrid = z.infer<typeof saveGridSchema>;

export const resultsQuerySchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: optId,
});
export const publishSchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
});
export const unpublishSchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

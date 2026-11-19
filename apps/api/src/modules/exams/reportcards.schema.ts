import { z } from "zod";
import { optId } from "../../utils/zodHelpers";

export const cardsQuerySchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
  studentId: optId,
  sectionId: optId,
});
export type CardsQuery = z.infer<typeof cardsQuerySchema>;

// undefined = leave unchanged, blank or null = clear
const remark = z.string().trim().max(300).nullable().optional();

export const remarksSchema = z
  .object({
    examId: z.string().min(1),
    classId: z.string().min(1),
    entries: z
      .array(
        z.object({
          studentId: z.string().min(1),
          teacherRemarks: remark,
          principalRemarks: remark,
        }),
      )
      .min(1)
      .max(300),
  })
  .superRefine((v, ctx) => {
    const ids = v.entries.map((e) => e.studentId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "A student appears twice",
      });
  });
export type RemarksInput = z.infer<typeof remarksSchema>;

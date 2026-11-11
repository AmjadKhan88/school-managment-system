import { z } from "zod";
import { emptyToUndef, opt, optEnum, optId } from "../../utils/zodHelpers";

const OUTCOMES = ["PROMOTED", "REPEATED", "GRADUATED"] as const;

export const candidatesQuerySchema = z.object({
  fromSessionId: z.string().min(1),
  toSessionId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: optId,
});

const item = z.object({
  studentId: z.string().min(1),
  outcome: z.enum(OUTCOMES),
  classId: optId, // required for PROMOTED; ignored otherwise
  sectionId: optId, // required for PROMOTED and REPEATED
  rollNo: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(999).optional(),
  ),
  remarks: opt(300),
});

export const executeSchema = z
  .object({
    fromSessionId: z.string().min(1),
    toSessionId: z.string().min(1),
    items: z.array(item).min(1, "Select at least one student").max(300),
  })
  .superRefine((v, ctx) => {
    if (v.fromSessionId === v.toSessionId) {
      ctx.addIssue({
        code: "custom",
        path: ["toSessionId"],
        message: "Choose a different target session",
      });
    }
    const ids = v.items.map((i) => i.studentId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "A student appears more than once",
      });
    }
  });
export type ExecuteInput = z.infer<typeof executeSchema>;

export const historyQuerySchema = z.object({
  q: opt(100),
  outcome: optEnum(OUTCOMES),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

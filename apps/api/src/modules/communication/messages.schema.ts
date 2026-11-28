import { z } from "zod";
import { emptyToUndef, opt, optEnum, optId } from "../../utils/zodHelpers";

export const CHANNELS = ["WHATSAPP", "SMS", "EMAIL"] as const;
export type Channel = (typeof CHANNELS)[number];
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PARENTS_ALL") }),
  z.object({
    type: z.literal("PARENTS_CLASS"),
    classId: z.string().min(1, "Choose a class"),
    sectionId: optId,
  }),
  z.object({
    type: z.literal("DEFAULTERS"),
    classId: optId,
    sectionId: optId,
    minOutstanding: z.preprocess(
      emptyToUndef,
      z.coerce.number().min(0).max(9_999_999).default(0),
    ),
  }),
  z.object({
    type: z.literal("STAFF"),
    teachersOnly: z.boolean().default(false),
  }),
]);
export type Audience = z.infer<typeof audienceSchema>;

export const composeSchema = z
  .object({
    channel: z.enum(CHANNELS),
    templateId: optId,
    subject: opt(150),
    body: z.string().trim().min(5, "Write the message").max(1000),
    audience: audienceSchema,
  })
  .superRefine((v, ctx) => {
    if (v.channel === "EMAIL" && !v.subject)
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Write a subject for the email",
      });
  });
export type ComposeInput = z.infer<typeof composeSchema>;

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  subject: opt(150),
  body: z.string().trim().min(5).max(1000),
  waTemplateName: opt(100),
  waLanguage: z.string().trim().min(2).max(10).default("en"),
  isActive: z.boolean().optional(),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const batchListSchema = z.object({
  channel: optEnum(CHANNELS),
  ...page,
});
export type BatchListQuery = z.infer<typeof batchListSchema>;
export const logListSchema = z.object({
  status: optEnum([
    "QUEUED",
    "SENT",
    "DELIVERED",
    "READ",
    "FAILED",
    "MANUAL",
  ] as const),
  q: opt(100),
  ...page,
});
export type LogListQuery = z.infer<typeof logListSchema>;

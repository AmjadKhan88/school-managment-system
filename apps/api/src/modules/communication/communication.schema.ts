import { z } from "zod";
import { emptyToUndef, opt, optEnum } from "../../utils/zodHelpers";

export const KINDS = ["NOTICE", "CIRCULAR", "ANNOUNCEMENT"] as const;
export const AUDIENCES = [
  "ALL",
  "PARENTS",
  "STUDENTS",
  "STAFF",
  "CLASS",
] as const;
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const noticeSchema = z
  .object({
    kind: z.enum(KINDS),
    title: z
      .string()
      .trim()
      .min(3, "Give a title of at least 3 characters")
      .max(150),
    body: z.string().trim().min(5, "Write the message").max(5000),
    audience: z.enum(AUDIENCES),
    classIds: z.array(z.string().min(1)).max(60).default([]),
    expiresOn: z.preprocess(emptyToUndef, z.coerce.date().optional()),
    isPinned: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "CLASS" && v.classIds.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["classIds"],
        message: "Choose at least one class",
      });
    if (v.expiresOn && v.expiresOn.getTime() < todayUtc().getTime())
      ctx.addIssue({
        code: "custom",
        path: ["expiresOn"],
        message: "The expiry date is in the past",
      });
  });
export type NoticeInput = z.infer<typeof noticeSchema>;

export const noticeListSchema = z.object({
  kind: optEnum(KINDS),
  status: optEnum(["DRAFT", "PUBLISHED", "ARCHIVED"] as const),
  q: opt(100),
  ...page,
});
export type NoticeListQuery = z.infer<typeof noticeListSchema>;

export const inboxListSchema = z.object({
  kind: optEnum(KINDS),
  unread: optEnum(["yes"] as const),
  ...page,
});
export type InboxQuery = z.infer<typeof inboxListSchema>;

export const archiveSchema = z.object({ reason: opt(300) });

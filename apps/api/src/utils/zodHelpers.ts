import { z } from "zod";

export const emptyToUndef = (v: unknown) =>
  v === "" || v === null ? undefined : v;

/** Optional trimmed text; blank becomes undefined. */
export const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const optEmail = z.preprocess(
  emptyToUndef,
  z.string().trim().email("Enter a valid email").optional(),
);
export const optDate = z.preprocess(emptyToUndef, z.coerce.date().optional());
export const optId = z.preprocess(emptyToUndef, z.string().min(1).optional());

export const optEnum = <U extends string>(values: readonly [U, ...U[]]) =>
  z.preprocess(emptyToUndef, z.enum(values).optional());

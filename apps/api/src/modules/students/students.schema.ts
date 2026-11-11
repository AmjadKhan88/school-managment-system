import { z } from "zod";
import { opt, optDate, optEnum, optId } from "../../utils/zodHelpers";

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
const STATUSES = ["ACTIVE", "PASSED_OUT", "TRANSFERRED", "LEFT"] as const;

export const listQuerySchema = z.object({
  q: opt(100),
  sessionId: optId,
  classId: optId,
  sectionId: optId,
  gender: optEnum(GENDERS),
  status: optEnum(STATUSES),
  archived: z.enum(["true", "false"]).default("false"),
  admissionFrom: optDate,
  admissionTo: optDate,
  sortBy: z
    .enum(["admissionNo", "fullName", "admissionDate"])
    .default("admissionNo"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Optional text that can be cleared: a blank string is saved as null. */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

// admissionNo is never editable. Class changes happen through promotion/transfer, not here.
export const updateStudentSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  fatherName: z.string().trim().min(2).max(100).optional(),
  motherName: clearable(100),
  dateOfBirth: z.coerce
    .date()
    .refine((d) => d < new Date(), "Date of birth must be in the past")
    .optional(),
  gender: z.enum(GENDERS).optional(),
  bloodGroup: clearable(5),
  nationality: z.string().trim().min(2).max(60).optional(),
  religion: clearable(60),
  bFormNo: clearable(20),
  previousSchool: clearable(120),
  permanentAddress: clearable(300),
  currentAddress: clearable(300),
  city: clearable(60),
  postalCode: clearable(12),
  medicalNotes: clearable(500),
  needsTransport: z.boolean().optional(),
  emergencyName: clearable(100),
  emergencyPhone: clearable(20),
  remarks: clearable(500),
});

export const archiveSchema = z.object({ archived: z.boolean() });

export const passedOutQuerySchema = z.object({
  q: opt(100),
  sessionId: optId, // the session they graduated in
  gender: optEnum(GENDERS),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PassedOutQuery = z.infer<typeof passedOutQuerySchema>;

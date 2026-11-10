import { z } from "zod";
import { opt, optDate, optEmail, optEnum, optId } from "../../utils/zodHelpers";

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
const OPEN_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "ADMISSION_PENDING",
  "REJECTED",
] as const;
const ALL_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "ADMISSION_PENDING",
  "ADMITTED",
  "REJECTED",
] as const;

const base = z.object({
  studentName: z.string().trim().min(2).max(100),
  fatherName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(20),
  email: optEmail,
  dateOfBirth: optDate,
  gender: optEnum(GENDERS),
  interestedClassId: optId,
  previousSchool: opt(120),
  address: opt(300),
  enquiryDate: z.coerce.date().default(() => new Date()),
  source: opt(60),
  remarks: opt(500),
  followUpDate: optDate,
});

export const createEnquirySchema = base;
export const updateEnquirySchema = base.partial();

// ADMITTED can only be set by converting the enquiry into an admission.
export const statusSchema = z.object({
  status: z.enum(OPEN_STATUSES),
  followUpDate: optDate,
  remarks: opt(500),
});

export const listQuerySchema = z.object({
  q: opt(100),
  status: optEnum(ALL_STATUSES),
  from: optDate,
  to: optDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

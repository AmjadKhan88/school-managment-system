import { z } from "zod";
import {
  opt,
  optDate,
  optEmail,
  optEnum,
  optId,
  emptyToUndef,
} from "../../utils/zodHelpers";

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
const RELATIONS = ["FATHER", "MOTHER", "GUARDIAN", "OTHER"] as const;

const studentSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  fatherName: z.string().trim().min(2).max(100),
  motherName: opt(100),
  dateOfBirth: z.coerce
    .date()
    .refine((d) => d < new Date(), "Date of birth must be in the past"),
  gender: z.enum(GENDERS),
  bloodGroup: opt(5),
  nationality: z.string().trim().min(2).max(60).default("Pakistani"),
  religion: opt(60),
  bFormNo: opt(20),
  previousSchool: opt(120),
  admissionDate: z.coerce.date().default(() => new Date()),
  permanentAddress: opt(300),
  currentAddress: opt(300),
  city: opt(60),
  postalCode: opt(12),
  medicalNotes: opt(500),
  needsTransport: z.boolean().default(false),
  emergencyName: opt(100),
  emergencyPhone: opt(20),
  remarks: opt(500),
});

// Either link an existing guardian (siblings) or supply name + phone for a new one.
const guardianSchema = z
  .object({
    guardianId: optId,
    fullName: opt(100),
    phone: opt(20),
    email: optEmail,
    occupation: opt(80),
    relation: z.enum(RELATIONS),
    isPrimary: z.boolean().default(false),
  })
  .refine((g) => g.guardianId || (g.fullName && g.phone), {
    message: "Choose an existing guardian, or enter a name and phone number",
    path: ["fullName"],
  });

const placementSchema = z.object({
  sessionId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  rollNo: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(999).optional(),
  ),
});

export const admissionSchema = z.object({
  student: studentSchema,
  guardians: z.array(guardianSchema).min(1, "Add at least one guardian").max(4),
  placement: placementSchema,
  enquiryId: optId,
  admissionRemarks: opt(500),
  confirmDuplicate: z.boolean().default(false),
});
export type AdmissionInput = z.infer<typeof admissionSchema>;

export const duplicateQuerySchema = z.object({
  fullName: z.string().trim().min(2),
  fatherName: z.string().trim().min(2),
  dateOfBirth: z.coerce.date(),
});

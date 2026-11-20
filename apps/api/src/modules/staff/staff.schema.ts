import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";
import { money } from "../fees/fees.schema";

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime() + 86_400_000;

/** Optional text that can be cleared: blank becomes null, omitted stays unchanged. */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));
const clearId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v));

const cnic = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) =>
    v === undefined ? undefined : v ? v.replace(/-/g, "") : null,
  )
  .refine(
    (v) => v === undefined || v === null || /^\d{13}$/.test(v),
    "Enter the 13-digit CNIC",
  );

const email = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v?.toLowerCase()))
  .refine(
    (v) => !v || z.string().email().safeParse(v).success,
    "Enter a valid email address",
  );

const TYPES = ["PERMANENT", "CONTRACT", "PART_TIME", "VISITING"] as const;
const STATUSES = ["ACTIVE", "RESIGNED", "TERMINATED", "RETIRED"] as const;
export const ACCOUNT_ROLES = [
  "teacher",
  "class-teacher",
  "vice-principal",
  "principal",
  "accountant",
  "admission-officer",
  "attendance-operator",
  "librarian",
  "transport-manager",
  "hr-manager",
] as const;

const sort = z.preprocess(
  emptyToUndef,
  z.coerce.number().int().min(0).max(999).optional(),
);
export const designationSchema = z.object({
  name: z.string().trim().min(2).max(60),
  isTeaching: z.boolean().default(false),
  sortOrder: sort,
  isActive: z.boolean().optional(),
});
export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: sort,
  isActive: z.boolean().optional(),
});

export const employeeSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  fatherName: clearable(100),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z.preprocess(
    emptyToUndef,
    z.coerce
      .date()
      .refine((d) => d < new Date(), "Date of birth must be in the past")
      .optional(),
  ),
  cnic,
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  email,
  address: clearable(300),
  city: clearable(60),
  designationId: z.string().min(1, "Choose a designation"),
  departmentId: clearId,
  qualification: clearable(150),
  joiningDate: z.coerce
    .date()
    .refine(notFuture, "The joining date cannot be in the future"),
  employmentType: z.enum(TYPES).default("PERMANENT"),
  isTeacher: z.boolean().default(false),
  emergencyName: clearable(100),
  emergencyPhone: clearable(20),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const employeeListSchema = z.object({
  q: opt(100),
  status: optEnum(STATUSES),
  isTeacher: z.preprocess(emptyToUndef, z.enum(["true", "false"]).optional()),
  designationId: optId,
  departmentId: optId,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type EmployeeListQuery = z.infer<typeof employeeListSchema>;

export const statusSchema = z.object({
  status: z.enum(STATUSES),
  leavingDate: optDate,
  reason: opt(300),
});
export type StatusInput = z.infer<typeof statusSchema>;

export const payrollDetailsSchema = z.object({
  basicSalary: z.preprocess(emptyToUndef, money.optional()),
  bankName: clearable(80),
  accountTitle: clearable(100),
  accountNo: clearable(40),
});
export type PayrollDetailsInput = z.infer<typeof payrollDetailsSchema>;

export const accountSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  roleSlug: z.enum(ACCOUNT_ROLES),
});
export const activeSchema = z.object({ isActive: z.boolean() });

export const assignmentQuerySchema = z.object({
  sessionId: z.string().min(1),
  classId: z.string().min(1),
});
export const classTeachersSchema = z.object({
  sessionId: z.string().min(1),
  classId: z.string().min(1),
  cells: z
    .array(
      z.object({
        sectionId: z.string().min(1),
        employeeId: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(60),
});
export const teachingSchema = z.object({
  sessionId: z.string().min(1),
  classId: z.string().min(1),
  cells: z
    .array(
      z.object({
        sectionId: z.string().min(1),
        subjectId: z.string().min(1),
        employeeId: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(600),
});
export type ClassTeachersInput = z.infer<typeof classTeachersSchema>;
export type TeachingInput = z.infer<typeof teachingSchema>;
export const scopeQuerySchema = z.object({ sessionId: optId });

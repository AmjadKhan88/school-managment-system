import { z } from "zod";
import {
  emptyToUndef,
  opt,
  optDate,
  optEnum,
  optId,
} from "../../utils/zodHelpers";

const id = z.string().min(1);
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const notFuture = (d: Date) => d.getTime() <= todayUtc().getTime();
const money = z.coerce.number().min(0).max(1_000_000);
/** An empty box means "no value", so saving can also clear a field. */
const nul = <T extends z.ZodTypeAny>(t: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), t.nullable());
const text = (max: number) => nul(z.string().trim().max(max));
const dateOrNull = nul(z.coerce.date());
const time = nul(
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the form 07:30"),
);

export const vehicleSchema = z.object({
  vehicleNo: z.string().trim().toUpperCase().min(3).max(20),
  make: text(60),
  model: text(60),
  year: nul(
    z.coerce
      .number()
      .int()
      .min(1980)
      .max(new Date().getFullYear() + 1),
  ),
  capacity: z.coerce.number().int().min(1).max(100),
  status: z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]).default("ACTIVE"),
  registrationExpiry: dateOrNull,
  insuranceExpiry: dateOrNull,
  notes: text(300),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const maintenanceSchema = z.object({
  serviceDate: z.coerce
    .date()
    .refine(notFuture, "The date cannot be in the future"),
  description: z.string().trim().min(3).max(300),
  cost: nul(money),
  workshop: text(100),
  nextDueDate: dateOrNull,
  odometer: nul(z.coerce.number().int().min(0).max(5_000_000)),
});
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

export const driverSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(20),
  cnic: text(15),
  licenseNo: text(30),
  licenseExpiry: dateOrNull,
  address: text(200),
  isActive: z.boolean().optional(),
});
export type DriverInput = z.infer<typeof driverSchema>;

export const routeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  vehicleId: nul(id),
  driverId: nul(id),
  morningTime: time,
  afternoonTime: time,
  notes: text(300),
  isActive: z.boolean().optional(),
});
export type RouteInput = z.infer<typeof routeSchema>;

export const stopSchema = z.object({
  routeId: id,
  name: z.string().trim().min(2).max(80),
  sortOrder: nul(z.coerce.number().int().min(1).max(500)),
  pickupTime: time,
  monthlyFee: money,
  isActive: z.boolean().optional(),
});
export type StopInput = z.infer<typeof stopSchema>;
export const stopFeeSchema = z.object({
  monthlyFee: money,
  applyToStudents: z.boolean().default(false),
});
export const stopListSchema = z.object({ routeId: optId });

export const assignSchema = z.object({
  studentId: id,
  stopId: id,
  monthlyFee: z.preprocess(emptyToUndef, money.optional()),
  feeNote: text(200),
  startDate: z.preprocess(emptyToUndef, z.coerce.date().optional()),
});
export type AssignInput = z.infer<typeof assignSchema>;
export const moveSchema = assignSchema.omit({ studentId: true });
export type MoveInput = z.infer<typeof moveSchema>;
export const endSchema = z.object({
  endDate: z.preprocess(emptyToUndef, z.coerce.date().optional()),
  reason: z.string().trim().min(3).max(200),
});
export type EndInput = z.infer<typeof endSchema>;

export const assignmentListSchema = z.object({
  routeId: optId,
  status: optEnum(["ACTIVE", "ENDED"] as const),
  q: opt(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AssignmentListQuery = z.infer<typeof assignmentListSchema>;
export const studentSearchSchema = z.object({ q: z.string().trim().min(2) });

export const TRIPS = ["MORNING", "AFTERNOON"] as const;
export const attendanceQuerySchema = z.object({
  routeId: id,
  date: z.coerce.date().refine(notFuture, "The date cannot be in the future"),
  trip: z.enum(TRIPS),
});
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export const attendanceSaveSchema = attendanceQuerySchema.extend({
  records: z
    .array(z.object({ studentId: id, status: z.enum(["BOARDED", "ABSENT"]) }))
    .min(1)
    .max(200),
});
export type AttendanceSave = z.infer<typeof attendanceSaveSchema>;

export const TRANSPORT_REPORTS = [
  "roster",
  "utilization",
  "fees",
  "attendance",
  "maintenance",
  "expiry",
] as const;
export type TransportReportType = (typeof TRANSPORT_REPORTS)[number];
export const reportParamSchema = z.object({ type: z.enum(TRANSPORT_REPORTS) });
export const reportQuerySchema = z.object({
  from: optDate,
  to: optDate,
  routeId: optId,
  vehicleId: optId,
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

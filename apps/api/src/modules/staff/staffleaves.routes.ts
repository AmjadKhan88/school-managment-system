import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { nextNo } from "../finance/finance.service";
import { displayName, MAX_BYTES, validateUpload } from "../finance/uploads";
import { leaveFilePath, removeLeaveFile, saveLeaveFile } from "../leaves/files";
import { LEAVE_TYPE_LABEL, leaveDays } from "../leaves/leave.calc";
import { reasonSchema } from "../leaves/leaves.schema";
import {
  employeeSearchSchema,
  staffLeaveListSchema,
  StaffLeaveListQuery,
  staffLeaveSchema,
  StaffLeaveInput,
} from "./staffleaves.schema";

export const staffLeavesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});
const receiveFile = (req: Request, res: Response, next: NextFunction) =>
  upload.single("document")(req, res, (err: unknown) => {
    if (!err) return next();
    next(
      ApiError.badRequest(
        (err as { code?: string }).code === "LIMIT_FILE_SIZE"
          ? "The file is too large (5 MB maximum)"
          : "The upload failed",
      ),
    );
  });

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const day = (d: Date) => d.toISOString().slice(0, 10);
const myEmployee = (userId: string) =>
  prisma.employee.findFirst({
    where: { userId },
    select: { id: true, employeeNo: true, fullName: true },
  });
const canSeeAll = (req: Request) => req.user!.permissions.has("staff:VIEW");
const canDecide = (req: Request) =>
  req.user!.permissions.has("leaves:APPROVE") &&
  req.user!.permissions.has("staff:VIEW");

// Only staff leave is handled here. Student leave lives under /leaves and refuses these records too.
staffLeavesRouter.param("id", async (_req, _res, next, id) => {
  try {
    const r = await prisma.leaveApplication.findUnique({
      where: { id },
      select: { applicantType: true },
    });
    if (r && r.applicantType !== "EMPLOYEE")
      return next(ApiError.notFound("Leave application not found"));
    next();
  } catch (e) {
    next(e);
  }
});

const employeeInclude = {
  employee: {
    select: {
      id: true,
      employeeNo: true,
      fullName: true,
      designation: { select: { name: true } },
    },
  },
};
type Row = Prisma.LeaveApplicationGetPayload<{
  include: typeof employeeInclude;
}>;
const shape = (r: Row) => ({
  id: r.id,
  applicationNo: r.applicationNo,
  leaveType: r.leaveType,
  startDate: r.startDate,
  endDate: r.endDate,
  days: r.days,
  reason: r.reason,
  status: r.status,
  hasDocument: !!r.documentStoredName,
  rejectionReason: r.rejectionReason,
  cancelReason: r.cancelReason,
  createdAt: r.createdAt,
  employee: r.employee
    ? {
        id: r.employee.id,
        employeeNo: r.employee.employeeNo,
        fullName: r.employee.fullName,
        designation: r.employee.designation.name,
      }
    : null,
});

async function visibleWhere(
  req: Request,
  qy?: StaffLeaveListQuery,
): Promise<Prisma.LeaveApplicationWhereInput> {
  const base: Prisma.LeaveApplicationWhereInput = { applicantType: "EMPLOYEE" };
  if (!canSeeAll(req)) {
    const me = await myEmployee(req.user!.id);
    return { ...base, employeeId: me?.id ?? "__none__" };
  }
  if (!qy) return base;
  return {
    ...base,
    ...(qy.status && { status: qy.status }),
    ...(qy.type && { leaveType: qy.type }),
    ...(qy.employeeId && { employeeId: qy.employeeId }),
    ...(qy.from && { endDate: { gte: qy.from } }),
    ...(qy.to && { startDate: { lte: qy.to } }),
    ...(qy.q && {
      employee: {
        OR: [
          { fullName: { contains: qy.q, mode: "insensitive" } },
          { employeeNo: { contains: qy.q, mode: "insensitive" } },
        ],
      },
    }),
  };
}

async function loadVisible(req: Request, id: string) {
  const r = await prisma.leaveApplication.findUnique({
    where: { id },
    include: employeeInclude,
  });
  if (!r) throw ApiError.notFound("Leave application not found");
  if (!canSeeAll(req)) {
    const me = await myEmployee(req.user!.id);
    if (!me || me.id !== r.employeeId)
      throw ApiError.forbidden("You can only see your own leave applications");
  }
  return r;
}

// ---- Who am I, and what may I do ----
staffLeavesRouter.get(
  "/me",
  authorize("leaves", "VIEW"),
  h(async (req, res) =>
    ok(res, {
      employee: await myEmployee(req.user!.id),
      canApplyForOthers: req.user!.permissions.has("staff:EDIT"),
      canDecide: canDecide(req),
    }),
  ),
);

staffLeavesRouter.get(
  "/employee-search",
  authorize("leaves", "CREATE"),
  validate(employeeSearchSchema, "query"),
  h(async (req, res) => {
    if (!req.user!.permissions.has("staff:EDIT")) throw ApiError.forbidden();
    const { q } = req.query as unknown as { q: string };
    ok(
      res,
      await prisma.employee.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { employeeNo: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          employeeNo: true,
          fullName: true,
          designation: { select: { name: true } },
        },
      }),
    );
  }),
);

// ---- List ----
staffLeavesRouter.get(
  "/",
  authorize("leaves", "VIEW"),
  validate(staffLeaveListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as StaffLeaveListQuery;
    const where = await visibleWhere(req, qy);
    const [rows, total, pending] = await prisma.$transaction([
      prisma.leaveApplication.findMany({
        where,
        include: employeeInclude,
        orderBy: { createdAt: "desc" },
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
      }),
      prisma.leaveApplication.count({ where }),
      prisma.leaveApplication.count({
        where: { ...(await visibleWhere(req)), status: "PENDING" },
      }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      pending,
      items: rows.map(shape),
    });
  }),
);

// Must stay above /:id
staffLeavesRouter.get(
  "/export",
  authorize("leaves", "EXPORT"),
  validate(staffLeaveListSchema, "query"),
  h(async (req, res) => {
    if (!canSeeAll(req)) throw ApiError.forbidden();
    const rows = await prisma.leaveApplication.findMany({
      where: await visibleWhere(
        req,
        req.query as unknown as StaffLeaveListQuery,
      ),
      include: employeeInclude,
      orderBy: { startDate: "desc" },
      take: 20000,
    });
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: rows.map((r) => r.decidedById).filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const by = new Map(users.map((u) => [u.id, u.fullName]));
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "staff_leave",
      newValues: { rows: rows.length },
    });
    await sendXlsx(
      res,
      `staff-leave-${day(new Date())}`,
      "Staff leave",
      [
        { header: "Application", key: "no", width: 16 },
        { header: "Employee", key: "emp", width: 26 },
        { header: "Emp no", key: "code", width: 12 },
        { header: "Type", key: "type", width: 16 },
        { header: "From", key: "from", width: 13 },
        { header: "To", key: "to", width: 13 },
        { header: "Days", key: "days", width: 8 },
        { header: "Reason", key: "reason", width: 40 },
        { header: "Status", key: "status", width: 12 },
        { header: "Decided by", key: "by", width: 20 },
        { header: "Remarks", key: "remarks", width: 30 },
      ],
      rows.map((r) => ({
        no: r.applicationNo,
        emp: r.employee?.fullName ?? "",
        code: r.employee?.employeeNo ?? "",
        type: LEAVE_TYPE_LABEL[r.leaveType] ?? r.leaveType,
        from: day(r.startDate),
        to: day(r.endDate),
        days: r.days,
        reason: r.reason,
        status: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        by: r.decidedById ? (by.get(r.decidedById) ?? "") : "",
        remarks: r.rejectionReason ?? r.cancelReason ?? "",
      })),
    );
  }),
);

staffLeavesRouter.get(
  "/:id",
  authorize("leaves", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await loadVisible(req, req.params.id);
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: [r.submittedById, r.decidedById].filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const by = new Map(users.map((u) => [u.id, u.fullName]));
    ok(res, {
      ...shape(r),
      decidedAt: r.decidedAt,
      submittedBy: r.submittedById ? (by.get(r.submittedById) ?? null) : null,
      decidedBy: r.decidedById ? (by.get(r.decidedById) ?? null) : null,
      document: r.documentStoredName
        ? { name: r.documentName, mime: r.documentMime, size: r.documentSize }
        : null,
    });
  }),
);

staffLeavesRouter.get(
  "/:id/document",
  authorize("leaves", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await loadVisible(req, req.params.id);
    if (!r.documentStoredName) throw ApiError.notFound("No document attached");
    res.setHeader("Content-Type", r.documentMime ?? "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(r.documentName ?? "document")}`,
    );
    res.sendFile(leaveFilePath(r.documentStoredName), (err) => {
      if (err && !res.headersSent)
        res.status(404).json({
          success: false,
          message: "The file is missing on the server",
        });
    });
  }),
);

// ---- Apply (multipart: fields + optional "document") ----
staffLeavesRouter.post(
  "/",
  authorize("leaves", "CREATE"),
  receiveFile,
  validate(staffLeaveSchema),
  h(async (req, res) => {
    const b = req.body as StaffLeaveInput;
    const me = await myEmployee(req.user!.id);
    const targetId = b.employeeId ?? me?.id;
    if (!targetId)
      throw ApiError.badRequest(
        "Your login is not linked to an employee record. Choose the employee this leave is for.",
      );
    if (targetId !== me?.id && !req.user!.permissions.has("staff:EDIT"))
      throw ApiError.forbidden("You can apply for leave only for yourself");

    const emp = await prisma.employee.findUnique({
      where: { id: targetId },
      select: { id: true, status: true },
    });
    if (!emp || emp.status !== "ACTIVE")
      throw ApiError.badRequest("Choose an active employee");
    const clash = await prisma.leaveApplication.findFirst({
      where: {
        applicantType: "EMPLOYEE",
        employeeId: targetId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: b.endDate },
        endDate: { gte: b.startDate },
      },
      select: { applicationNo: true },
    });
    if (clash)
      throw ApiError.conflict(
        `This employee already has leave ${clash.applicationNo} covering some of these dates`,
      );

    let stored: string | null = null;
    const file = req.file;
    if (file) {
      const check = validateUpload(file);
      if ("error" in check) throw ApiError.badRequest(check.error);
      stored = await saveLeaveFile(file.buffer, check.ext);
    }
    try {
      const row = await prisma.$transaction(async (tx) =>
        tx.leaveApplication.create({
          data: {
            applicationNo: await nextNo(tx, "SLV", todayUtc()),
            applicantType: "EMPLOYEE",
            employeeId: targetId,
            leaveType: b.leaveType,
            startDate: b.startDate,
            endDate: b.endDate,
            days: leaveDays(b.startDate, b.endDate),
            reason: b.reason,
            submittedById: req.user!.id,
            ...(file &&
              stored && {
                documentName: displayName(file.originalname),
                documentStoredName: stored,
                documentMime: file.mimetype,
                documentSize: file.size,
              }),
          },
          select: { id: true, applicationNo: true },
        }),
      );
      await writeAudit(req, {
        action: "STAFF_LEAVE_APPLIED",
        entity: "leave_applications",
        entityId: row.id,
        newValues: {
          ...b,
          employeeId: targetId,
          applicationNo: row.applicationNo,
        },
      });
      ok(res, row, 201);
    } catch (e) {
      if (stored) await removeLeaveFile(stored);
      throw e;
    }
  }),
);

// ---- Add or replace the document while pending ----
staffLeavesRouter.post(
  "/:id/document",
  authorize("leaves", "CREATE"),
  validate(idParam, "params"),
  receiveFile,
  h(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest("Choose a file to upload");
    const r = await loadVisible(req, req.params.id);
    if (r.status !== "PENDING")
      throw ApiError.conflict(
        "A document can only be changed while the application is pending",
      );
    const me = await myEmployee(req.user!.id);
    if (
      r.submittedById !== req.user!.id &&
      me?.id !== r.employeeId &&
      !canDecide(req)
    )
      throw ApiError.forbidden(
        "Only the person who entered it, the employee, or an approver can change its document",
      );

    const check = validateUpload(file);
    if ("error" in check) throw ApiError.badRequest(check.error);
    const stored = await saveLeaveFile(file.buffer, check.ext);
    try {
      await prisma.leaveApplication.update({
        where: { id: r.id },
        data: {
          documentName: displayName(file.originalname),
          documentStoredName: stored,
          documentMime: file.mimetype,
          documentSize: file.size,
        },
      });
    } catch (e) {
      await removeLeaveFile(stored);
      throw e;
    }
    if (r.documentStoredName) await removeLeaveFile(r.documentStoredName);
    await writeAudit(req, {
      action: "STAFF_LEAVE_DOCUMENT_UPDATED",
      entity: "leave_applications",
      entityId: r.id,
    });
    ok(res, { id: r.id });
  }),
);

// ---- Decide: needs leaves:Approve AND staff:View, and never your own leave ----
async function decidable(req: Request, id: string) {
  if (!canDecide(req))
    throw ApiError.forbidden(
      "You do not have permission to decide staff leave",
    );
  const r = await loadVisible(req, id);
  if (r.status !== "PENDING")
    throw ApiError.conflict(
      `This application is already ${r.status.toLowerCase()}`,
    );
  const me = await myEmployee(req.user!.id);
  if (me && me.id === r.employeeId)
    throw ApiError.forbidden(
      "You cannot decide your own leave. Ask another approver.",
    );
  return r;
}

staffLeavesRouter.post(
  "/:id/approve",
  authorize("leaves", "APPROVE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await decidable(req, req.params.id);
    await prisma.leaveApplication.update({
      where: { id: r.id },
      data: {
        status: "APPROVED",
        decidedById: req.user!.id,
        decidedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "STAFF_LEAVE_APPROVED",
      entity: "leave_applications",
      entityId: r.id,
    });
    ok(res, { id: r.id });
  }),
);

staffLeavesRouter.post(
  "/:id/reject",
  authorize("leaves", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await decidable(req, req.params.id);
    await prisma.leaveApplication.update({
      where: { id: r.id },
      data: {
        status: "REJECTED",
        rejectionReason: req.body.reason,
        decidedById: req.user!.id,
        decidedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "STAFF_LEAVE_REJECTED",
      entity: "leave_applications",
      entityId: r.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: r.id });
  }),
);

// Pending: the person who entered it, the employee, or an approver. Approved: an approver only.
staffLeavesRouter.post(
  "/:id/cancel",
  authorize("leaves", "CREATE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await loadVisible(req, req.params.id);
    const me = await myEmployee(req.user!.id);
    if (r.status === "PENDING") {
      if (
        r.submittedById !== req.user!.id &&
        me?.id !== r.employeeId &&
        !canDecide(req)
      )
        throw ApiError.forbidden(
          "Only the person who entered it, the employee, or an approver can cancel this application",
        );
    } else if (r.status === "APPROVED") {
      if (!canDecide(req))
        throw ApiError.forbidden("Only an approver can cancel approved leave");
    } else
      throw ApiError.conflict(
        `This application is already ${r.status.toLowerCase()}`,
      );

    await prisma.leaveApplication.update({
      where: { id: r.id },
      data: {
        status: "CANCELLED",
        cancelReason: req.body.reason,
        decidedById: r.decidedById ?? req.user!.id,
        decidedAt: r.decidedAt ?? new Date(),
      },
    });
    await writeAudit(req, {
      action: "STAFF_LEAVE_CANCELLED",
      entity: "leave_applications",
      entityId: r.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: r.id });
  }),
);

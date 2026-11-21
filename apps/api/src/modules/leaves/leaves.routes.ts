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
import { LEAVE_TYPE_LABEL, leaveDays } from "./leave.calc";
import { leaveFilePath, removeLeaveFile, saveLeaveFile } from "./files";
import {
  leaveListSchema,
  LeaveListQuery,
  leaveSchema,
  LeaveInput,
  reasonSchema,
  searchSchema,
} from "./leaves.schema";

export const leavesRouter = Router();

// Student leave only. Staff leave records are handled under /staff-leaves and must not be reachable here.
leavesRouter.param("id", async (_req, _res, next, id) => {
  try {
    const r = await prisma.leaveApplication.findUnique({
      where: { id },
      select: { applicantType: true },
    });
    if (r && r.applicantType !== "STUDENT")
      return next(ApiError.notFound("Leave application not found"));
    next();
  } catch (e) {
    next(e);
  }
});

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
const enrollmentSelect = {
  enrollments: {
    orderBy: { session: { startDate: "desc" as const } },
    take: 1,
    select: {
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  },
};

const names = async (ids: (string | null)[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: ids.filter((x): x is string => !!x) } },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((u) => [u.id, u.fullName]));
};

function leaveWhere(qy: LeaveListQuery): Prisma.LeaveApplicationWhereInput {
  return {
    applicantType: "STUDENT",
    ...(qy.status && { status: qy.status }),
    ...(qy.type && { leaveType: qy.type }),
    ...(qy.from && { endDate: { gte: qy.from } }),
    ...(qy.to && { startDate: { lte: qy.to } }),
    student: {
      ...(qy.classId && { enrollments: { some: { classId: qy.classId } } }),
      ...(qy.q && {
        OR: [
          { fullName: { contains: qy.q, mode: "insensitive" } },
          { admissionNo: { contains: qy.q, mode: "insensitive" } },
        ],
      }),
    },
  };
}

const shape = (
  r: Prisma.LeaveApplicationGetPayload<{
    include: {
      student: {
        select: {
          id: true;
          admissionNo: true;
          fullName: true;
          enrollments: {
            select: {
              class: { select: { name: true } };
              section: { select: { name: true } };
            };
          };
        };
      };
    };
  }>,
) => ({
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
  student: r.student
    ? {
        id: r.student.id,
        admissionNo: r.student.admissionNo,
        fullName: r.student.fullName,
      }
    : null,
  className: r.student?.enrollments[0]?.class.name ?? null,
  section: r.student?.enrollments[0]?.section.name ?? null,
});

// ---- Find a student to apply for ----
leavesRouter.get(
  "/student-search",
  authorize("leaves", "CREATE"),
  validate(searchSchema, "query"),
  h(async (req, res) => {
    const { q } = req.query as unknown as { q: string };
    const rows = await prisma.student.findMany({
      where: {
        status: "ACTIVE",
        archivedAt: null,
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { admissionNo: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        admissionNo: true,
        fullName: true,
        fatherName: true,
        ...enrollmentSelect,
      },
    });
    ok(
      res,
      rows.map((s) => ({
        id: s.id,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
        fatherName: s.fatherName,
        className: s.enrollments[0]?.class.name ?? null,
        section: s.enrollments[0]?.section.name ?? null,
      })),
    );
  }),
);

// ---- List ----
leavesRouter.get(
  "/",
  authorize("leaves", "VIEW"),
  validate(leaveListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as LeaveListQuery;
    const where = leaveWhere(qy);
    const include = {
      student: {
        select: {
          id: true as const,
          admissionNo: true as const,
          fullName: true as const,
          ...enrollmentSelect,
        },
      },
    };
    const [rows, total, pending] = await prisma.$transaction([
      prisma.leaveApplication.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
      }),
      prisma.leaveApplication.count({ where }),
      prisma.leaveApplication.count({
        where: { applicantType: "STUDENT", status: "PENDING" },
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

// ---- Export (must stay above /:id) ----
leavesRouter.get(
  "/export",
  authorize("leaves", "EXPORT"),
  validate(leaveListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as LeaveListQuery;
    const rows = await prisma.leaveApplication.findMany({
      where: leaveWhere(qy),
      orderBy: [{ startDate: "desc" }],
      take: 20000,
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            fullName: true,
            ...enrollmentSelect,
          },
        },
      },
    });
    const who = await names(rows.map((r) => r.decidedById));
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "leave_applications",
      newValues: { rows: rows.length },
    });
    const d = (x: Date) => x.toISOString().slice(0, 10);
    await sendXlsx(
      res,
      `leave-report-${d(new Date())}`,
      "Leave applications",
      [
        { header: "Application", key: "no", width: 16 },
        { header: "Student", key: "student", width: 26 },
        { header: "Adm no", key: "adm", width: 14 },
        { header: "Class", key: "class", width: 14 },
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
        student: r.student?.fullName ?? "",
        adm: r.student?.admissionNo ?? "",
        class: r.student?.enrollments[0]
          ? `${r.student.enrollments[0].class.name} / ${r.student.enrollments[0].section.name}`
          : "",
        type: LEAVE_TYPE_LABEL[r.leaveType],
        from: d(r.startDate),
        to: d(r.endDate),
        days: r.days,
        reason: r.reason,
        status: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        by: r.decidedById ? (who.get(r.decidedById) ?? "") : "",
        remarks: r.rejectionReason ?? r.cancelReason ?? "",
      })),
    );
  }),
);

// ---- One application ----
leavesRouter.get(
  "/:id",
  authorize("leaves", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await prisma.leaveApplication.findUnique({
      where: { id: req.params.id },
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            fullName: true,
            ...enrollmentSelect,
          },
        },
      },
    });
    if (!r) throw ApiError.notFound("Leave application not found");
    const who = await names([r.submittedById, r.decidedById]);
    ok(res, {
      ...shape(r),
      decidedAt: r.decidedAt,
      submittedBy: r.submittedById ? (who.get(r.submittedById) ?? null) : null,
      decidedBy: r.decidedById ? (who.get(r.decidedById) ?? null) : null,
      document: r.documentStoredName
        ? { name: r.documentName, mime: r.documentMime, size: r.documentSize }
        : null,
    });
  }),
);

// ---- Open the supporting document ----
leavesRouter.get(
  "/:id/document",
  authorize("leaves", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await prisma.leaveApplication.findUnique({
      where: { id: req.params.id },
    });
    if (!r || !r.documentStoredName)
      throw ApiError.notFound("No document attached");
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

// ---- Apply (multipart: fields + optional "document" file) ----
leavesRouter.post(
  "/",
  authorize("leaves", "CREATE"),
  receiveFile,
  validate(leaveSchema),
  h(async (req, res) => {
    const b = req.body as LeaveInput;
    const student = await prisma.student.findUnique({
      where: { id: b.studentId },
      select: { id: true, status: true, archivedAt: true },
    });
    if (!student || student.archivedAt || student.status !== "ACTIVE")
      throw ApiError.badRequest("Choose an active student");

    const clash = await prisma.leaveApplication.findFirst({
      where: {
        applicantType: "STUDENT",
        studentId: b.studentId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: b.endDate },
        endDate: { gte: b.startDate },
      },
      select: { applicationNo: true },
    });
    if (clash)
      throw ApiError.conflict(
        `This student already has leave ${clash.applicationNo} covering some of these dates`,
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
            applicationNo: await nextNo(tx, "LV", todayUtc()),
            applicantType: "STUDENT",
            studentId: b.studentId,
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
        action: "LEAVE_APPLIED",
        entity: "leave_applications",
        entityId: row.id,
        newValues: { ...b, applicationNo: row.applicationNo },
      });
      ok(res, row, 201);
    } catch (e) {
      if (stored) await removeLeaveFile(stored); // never leave an orphan file behind
      throw e;
    }
  }),
);

// ---- Add or replace the document while pending ----
leavesRouter.post(
  "/:id/document",
  authorize("leaves", "CREATE"),
  validate(idParam, "params"),
  receiveFile,
  h(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest("Choose a file to upload");
    const r = await prisma.leaveApplication.findUnique({
      where: { id: req.params.id },
    });
    if (!r) throw ApiError.notFound("Leave application not found");
    if (r.status !== "PENDING")
      throw ApiError.conflict(
        "A document can only be changed while the application is pending",
      );
    if (
      r.submittedById !== req.user!.id &&
      !req.user!.permissions.has("leaves:APPROVE")
    )
      throw ApiError.forbidden(
        "Only the person who entered this application can change its document",
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
      action: "LEAVE_DOCUMENT_UPDATED",
      entity: "leave_applications",
      entityId: r.id,
    });
    ok(res, { id: r.id });
  }),
);

// ---- Decide ----
leavesRouter.post(
  "/:id/approve",
  authorize("leaves", "APPROVE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await prisma.leaveApplication.findUnique({
      where: { id: req.params.id },
    });
    if (!r) throw ApiError.notFound("Leave application not found");
    if (r.status !== "PENDING")
      throw ApiError.conflict(
        `This application is already ${r.status.toLowerCase()}`,
      );
    await prisma.leaveApplication.update({
      where: { id: r.id },
      data: {
        status: "APPROVED",
        decidedById: req.user!.id,
        decidedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "LEAVE_APPROVED",
      entity: "leave_applications",
      entityId: r.id,
    });
    ok(res, { id: r.id });
  }),
);

leavesRouter.post(
  "/:id/reject",
  authorize("leaves", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await prisma.leaveApplication.findUnique({
      where: { id: req.params.id },
    });
    if (!r) throw ApiError.notFound("Leave application not found");
    if (r.status !== "PENDING")
      throw ApiError.conflict(
        `This application is already ${r.status.toLowerCase()}`,
      );
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
      action: "LEAVE_REJECTED",
      entity: "leave_applications",
      entityId: r.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: r.id });
  }),
);

// A pending application can be cancelled by whoever entered it or by an approver. Approved leave only by an approver.
leavesRouter.post(
  "/:id/cancel",
  authorize("leaves", "CREATE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await prisma.leaveApplication.findUnique({
      where: { id: req.params.id },
    });
    if (!r) throw ApiError.notFound("Leave application not found");
    const approver = req.user!.permissions.has("leaves:APPROVE");
    if (r.status === "PENDING") {
      if (r.submittedById !== req.user!.id && !approver)
        throw ApiError.forbidden(
          "Only the person who entered it, or an approver, can cancel this application",
        );
    } else if (r.status === "APPROVED") {
      if (!approver)
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
      action: "LEAVE_CANCELLED",
      entity: "leave_applications",
      entityId: r.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: r.id });
  }),
);

import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import {
  HistoryQuery,
  historyQuerySchema,
  internalSchema,
  outSchema,
  searchQuerySchema,
} from "./transfers.schema";
import { transferInternal, transferOut } from "./transfers.service";

export const transfersRouter = Router();

// ---- Find a currently enrolled student to transfer ----
transfersRouter.get(
  "/search",
  authorize("students", "VIEW"),
  validate(searchQuerySchema, "query"),
  h(async (req, res) => {
    const { q, sessionId } = req.query as unknown as {
      q: string;
      sessionId: string;
    };
    const rows = await prisma.enrollment.findMany({
      where: {
        sessionId,
        status: "ENROLLED",
        student: {
          status: "ACTIVE",
          archivedAt: null,
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { admissionNo: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      take: 10,
      orderBy: { student: { fullName: "asc" } },
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            fullName: true,
            fatherName: true,
          },
        },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    });
    ok(
      res,
      rows.map((r) => ({
        studentId: r.student.id,
        admissionNo: r.student.admissionNo,
        fullName: r.student.fullName,
        fatherName: r.student.fatherName,
        rollNo: r.rollNo,
        class: r.class,
        section: r.section,
      })),
    );
  }),
);

// ---- Move inside the school ----
transfersRouter.post(
  "/internal",
  authorize("students", "EDIT"),
  validate(internalSchema),
  h(async (req, res) => {
    const result = await transferInternal(req.body, req.user!.id);
    await writeAudit(req, {
      action: "STUDENT_MOVED",
      entity: "student_transfers",
      entityId: result.id,
      newValues: result,
    });
    ok(res, result, 201);
  }),
);

// ---- Transfer out of the school ----
transfersRouter.post(
  "/out",
  authorize("students", "EDIT"),
  validate(outSchema),
  h(async (req, res) => {
    const result = await transferOut(req.body, req.user!.id);
    await writeAudit(req, {
      action: "STUDENT_TRANSFERRED_OUT",
      entity: "student_transfers",
      entityId: result.id,
      newValues: result,
    });
    ok(res, result, 201);
  }),
);

// ---- History ----
transfersRouter.get(
  "/history",
  authorize("students", "VIEW"),
  validate(historyQuerySchema, "query"),
  h(async (req, res) => {
    const { q, type, page, pageSize } = req.query as unknown as HistoryQuery;
    const where: Prisma.StudentTransferWhereInput = {
      ...(type && { type }),
      ...(q && {
        student: {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { admissionNo: { contains: q, mode: "insensitive" } },
          ],
        },
      }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.studentTransfer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: { select: { id: true, admissionNo: true, fullName: true } },
        },
      }),
      prisma.studentTransfer.count({ where }),
    ]);

    // Class, section and session are stored as plain IDs, so names are looked up here.
    const classIds = new Set<string>(),
      sectionIds = new Set<string>(),
      sessionIds = new Set<string>();
    rows.forEach((r) => {
      classIds.add(r.fromClassId);
      sectionIds.add(r.fromSectionId);
      sessionIds.add(r.sessionId);
      if (r.toClassId) classIds.add(r.toClassId);
      if (r.toSectionId) sectionIds.add(r.toSectionId);
    });
    const [classes, sections, sessions] = await Promise.all([
      prisma.class.findMany({
        where: { id: { in: [...classIds] } },
        select: { id: true, name: true },
      }),
      prisma.section.findMany({
        where: { id: { in: [...sectionIds] } },
        select: { id: true, name: true },
      }),
      prisma.academicSession.findMany({
        where: { id: { in: [...sessionIds] } },
        select: { id: true, name: true },
      }),
    ]);
    const cn = new Map(classes.map((c) => [c.id, c.name]));
    const sn = new Map(sections.map((s) => [s.id, s.name]));
    const ssn = new Map(sessions.map((s) => [s.id, s.name]));

    ok(res, {
      page,
      pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        transferDate: r.transferDate,
        reason: r.reason,
        destinationSchool: r.destinationSchool,
        certificateNo: r.certificateNo,
        session: ssn.get(r.sessionId) ?? "—",
        student: r.student,
        from: {
          className: cn.get(r.fromClassId) ?? "—",
          section: sn.get(r.fromSectionId) ?? "—",
          rollNo: r.fromRollNo,
        },
        to: r.toClassId
          ? {
              className: cn.get(r.toClassId) ?? "—",
              section: sn.get(r.toSectionId ?? "") ?? "—",
              rollNo: r.toRollNo,
            }
          : null,
      })),
    });
  }),
);

import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize, tenant } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import {
  archiveSchema,
  ListQuery,
  listQuerySchema,
  updateStudentSchema,
} from "./students.schema";

export const studentsRouter = Router();

// ---- List: students enrolled in a session, with search, filters, sorting and paging ----
studentsRouter.get(
  "/",
  authorize("students", "VIEW"),
  validate(listQuerySchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as ListQuery;

    // No session given: fall back to the active one.
    const sessionId =
      qy.sessionId ??
      (
        await prisma.academicSession.findFirst({
          where: { ...tenant(req), isActive: true },
          select: { id: true },
        })
      )?.id;

    const enrollmentFilter: Prisma.EnrollmentWhereInput = {
      ...(sessionId && { sessionId }),
      ...(qy.classId && { classId: qy.classId }),
      ...(qy.sectionId && { sectionId: qy.sectionId }),
    };

    const where: Prisma.StudentWhereInput = {
      archivedAt: qy.archived === "true" ? { not: null } : null,
      ...(qy.status && { status: qy.status }),
      ...(qy.gender && { gender: qy.gender }),
      ...((qy.admissionFrom || qy.admissionTo) && {
        admissionDate: {
          ...(qy.admissionFrom && { gte: qy.admissionFrom }),
          ...(qy.admissionTo && { lte: qy.admissionTo }),
        },
      }),
      ...(Object.keys(enrollmentFilter).length > 0 && {
        enrollments: { some: enrollmentFilter },
      }),
      ...(qy.q && {
        OR: [
          { fullName: { contains: qy.q, mode: "insensitive" } },
          { fatherName: { contains: qy.q, mode: "insensitive" } },
          { admissionNo: { contains: qy.q, mode: "insensitive" } },
          { guardians: { some: { guardian: { phone: { contains: qy.q } } } } },
        ],
      }),
    };

    const orderBy: Prisma.StudentOrderByWithRelationInput =
      qy.sortBy === "fullName"
        ? { fullName: qy.sortDir }
        : qy.sortBy === "admissionDate"
          ? { admissionDate: qy.sortDir }
          : { admissionNo: qy.sortDir };

    const [items, total] = await prisma.$transaction([
      prisma.student.findMany({
        where,
        orderBy,
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        select: {
          id: true,
          admissionNo: true,
          fullName: true,
          fatherName: true,
          admissionDate: true,
          status: true,
          photoUrl: true,
          archivedAt: true,
          enrollments: {
            where: sessionId ? { sessionId } : undefined,
            orderBy: { session: { startDate: "desc" } },
            take: 1,
            select: {
              rollNo: true,
              class: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
            },
          },
          guardians: {
            orderBy: { isPrimary: "desc" },
            take: 1,
            select: { guardian: { select: { fullName: true, phone: true } } },
          },
        },
      }),
      prisma.student.count({ where }),
    ]);

    ok(res, { items, total, page: qy.page, pageSize: qy.pageSize, sessionId });
  }),
);

// ---- Full profile ----
studentsRouter.get(
  "/:id",
  authorize("students", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        guardians: {
          orderBy: { isPrimary: "desc" },
          include: {
            guardian: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                occupation: true,
              },
            },
          },
        },
        enrollments: {
          orderBy: { session: { startDate: "desc" } },
          include: { class: true, section: true, session: true },
        },
        admission: true,
      },
    });
    if (!student) throw ApiError.notFound("Student not found");
    const { userId: _userId, ...safe } = student; // never expose the login link
    ok(res, safe);
  }),
);

// ---- Edit personal details ----
studentsRouter.put(
  "/:id",
  authorize("students", "EDIT"),
  validate(idParam, "params"),
  validate(updateStudentSchema),
  h(async (req, res) => {
    const before = await prisma.student.findUnique({
      where: { id: req.params.id },
    });
    if (!before) throw ApiError.notFound("Student not found");
    const row = await prisma.student.update({
      where: { id: before.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "STUDENT_UPDATED",
      entity: "students",
      entityId: row.id,
      oldValues: before,
      newValues: row,
    });
    ok(res, row);
  }),
);

// ---- Archive / restore (students are never hard-deleted) ----
studentsRouter.patch(
  "/:id/archive",
  authorize("students", "DELETE"),
  validate(idParam, "params"),
  validate(archiveSchema),
  h(async (req, res) => {
    const found = await prisma.student.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Student not found");
    const row = await prisma.student.update({
      where: { id: found.id },
      data: { archivedAt: req.body.archived ? new Date() : null },
    });
    await writeAudit(req, {
      action: req.body.archived ? "STUDENT_ARCHIVED" : "STUDENT_RESTORED",
      entity: "students",
      entityId: found.id,
    });
    ok(res, { id: row.id, archivedAt: row.archivedAt });
  }),
);

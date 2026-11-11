import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import {
  candidatesQuerySchema,
  executeSchema,
  HistoryQuery,
  historyQuerySchema,
} from "./promotion.schema";
import { executePromotion } from "./promotion.service";

export const promotionRouter = Router();

// ---- Students who can be promoted from a class (and optionally a section) ----
promotionRouter.get(
  "/candidates",
  authorize("promotion", "VIEW"),
  validate(candidatesQuerySchema, "query"),
  h(async (req, res) => {
    const { fromSessionId, toSessionId, classId, sectionId } =
      req.query as unknown as {
        fromSessionId: string;
        toSessionId: string;
        classId: string;
        sectionId?: string;
      };

    const rows = await prisma.enrollment.findMany({
      where: {
        sessionId: fromSessionId,
        classId,
        ...(sectionId && { sectionId }),
        status: "ENROLLED",
        student: { status: "ACTIVE", archivedAt: null },
      },
      orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            fullName: true,
            fatherName: true,
          },
        },
        class: { select: { id: true, name: true, level: true } },
        section: { select: { id: true, name: true } },
      },
    });

    const targetRows = await prisma.enrollment.findMany({
      where: {
        sessionId: toSessionId,
        studentId: { in: rows.map((r) => r.student.id) },
      },
      select: { studentId: true },
    });
    const inTarget = new Set(targetRows.map((r) => r.studentId));

    // The next class up is the one with the smallest level above the current class.
    const currentLevel = rows[0]?.class.level;
    const next =
      currentLevel === undefined
        ? null
        : await prisma.class.findFirst({
            where: { level: { gt: currentLevel }, isActive: true },
            orderBy: { level: "asc" },
            select: { id: true },
          });

    ok(res, {
      nextClassId: next?.id ?? null,
      items: rows.map((r) => ({
        enrollmentId: r.id,
        studentId: r.student.id,
        admissionNo: r.student.admissionNo,
        fullName: r.student.fullName,
        fatherName: r.student.fatherName,
        rollNo: r.rollNo,
        class: r.class,
        section: r.section,
        alreadyInTarget: inTarget.has(r.student.id),
      })),
    });
  }),
);

// ---- Execute a promotion batch ----
promotionRouter.post(
  "/execute",
  authorize("promotion", "CREATE"),
  validate(executeSchema),
  h(async (req, res) => {
    const result = await executePromotion(req.body, req.user!.id);
    await writeAudit(req, {
      action: "STUDENTS_PROMOTED",
      entity: "student_promotions",
      entityId: result.batchId,
      newValues: result,
    });
    ok(res, result, 201);
  }),
);

// ---- History ----
promotionRouter.get(
  "/history",
  authorize("promotion", "VIEW"),
  validate(historyQuerySchema, "query"),
  h(async (req, res) => {
    const { q, outcome, page, pageSize } = req.query as unknown as HistoryQuery;
    const where: Prisma.StudentPromotionWhereInput = {
      ...(outcome && { outcome }),
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
      prisma.studentPromotion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: { select: { id: true, admissionNo: true, fullName: true } },
        },
      }),
      prisma.studentPromotion.count({ where }),
    ]);

    const enrollIds = [
      ...new Set(
        rows.flatMap((r) =>
          [r.fromEnrollmentId, r.toEnrollmentId].filter(
            (x): x is string => !!x,
          ),
        ),
      ),
    ];
    const enrollments = await prisma.enrollment.findMany({
      where: { id: { in: enrollIds } },
      include: {
        class: { select: { name: true } },
        section: { select: { name: true } },
        session: { select: { name: true } },
      },
    });
    const em = new Map(enrollments.map((e) => [e.id, e]));
    const shape = (id: string | null) => {
      const e = id ? em.get(id) : undefined;
      return e
        ? {
            session: e.session.name,
            className: e.class.name,
            section: e.section.name,
            rollNo: e.rollNo,
          }
        : null;
    };

    ok(res, {
      page,
      pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        batchId: r.batchId,
        createdAt: r.createdAt,
        outcome: r.outcome,
        remarks: r.remarks,
        student: r.student,
        from: shape(r.fromEnrollmentId),
        to: shape(r.toEnrollmentId),
      })),
    });
  }),
);

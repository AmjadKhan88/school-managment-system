import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import {
  effectiveItems,
  monthlyTotal,
  structureDto,
  structureInclude,
} from "./fees.helpers";
import {
  assignmentsQuerySchema,
  AssignmentsQuery,
  assignmentUpdateSchema,
  bulkAssignSchema,
  categorySchema,
  copySchema,
  enrollmentParam,
  sessionQuerySchema,
  structureSchema,
  StructureInput,
} from "./fees.schema";
import { discountsRouter } from "./discounts.routes";
import { invoicesRouter } from "./invoices.routes";

export const feesRouter = Router();
const OPTS = { timeout: 30_000, maxWait: 10_000 };

// =========================== Categories ===========================
feesRouter.get(
  "/categories",
  authorize("fees", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.feeCategory.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ),
  ),
);

feesRouter.post(
  "/categories",
  authorize("fees", "CREATE"),
  validate(categorySchema),
  h(async (req, res) => {
    const row = await prisma.feeCategory.create({ data: req.body });
    await writeAudit(req, {
      action: "FEE_CATEGORY_CREATED",
      entity: "fee_categories",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);

feesRouter.put(
  "/categories/:id",
  authorize("fees", "EDIT"),
  validate(idParam, "params"),
  validate(categorySchema),
  h(async (req, res) => {
    const row = await prisma.feeCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "FEE_CATEGORY_UPDATED",
      entity: "fee_categories",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);

// Restrict FK: refused with 409 once the category is used in any structure or override.
feesRouter.delete(
  "/categories/:id",
  authorize("fees", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.feeCategory.delete({ where: { id: req.params.id } });
    await writeAudit(req, {
      action: "FEE_CATEGORY_DELETED",
      entity: "fee_categories",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Structures ===========================
// Every active class with its structure for the session (or null).
feesRouter.get(
  "/structures",
  authorize("fees", "VIEW"),
  validate(sessionQuerySchema, "query"),
  h(async (req, res) => {
    const { sessionId } = req.query as unknown as { sessionId: string };
    const [classes, structures] = await Promise.all([
      prisma.class.findMany({
        where: { isActive: true },
        orderBy: { level: "asc" },
        select: { id: true, name: true, level: true },
      }),
      prisma.feeStructure.findMany({
        where: { sessionId },
        include: structureInclude,
      }),
    ]);
    const byClass = new Map(structures.map((s) => [s.classId, s]));
    ok(
      res,
      classes.map((c) => ({
        ...c,
        structure: byClass.has(c.id) ? structureDto(byClass.get(c.id)!) : null,
      })),
    );
  }),
);

// Create or replace the structure for one class in one session.
feesRouter.put(
  "/structures",
  authorize("fees", "EDIT"),
  validate(structureSchema),
  h(async (req, res) => {
    const b = req.body as StructureInput;
    const ids = b.items.map((i) => i.categoryId);

    const [session, cls, cats] = await Promise.all([
      prisma.academicSession.findUnique({
        where: { id: b.sessionId },
        select: { id: true },
      }),
      prisma.class.findUnique({
        where: { id: b.classId },
        select: { id: true },
      }),
      prisma.feeCategory.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!session) throw ApiError.notFound("Academic session not found");
    if (!cls) throw ApiError.notFound("Class not found");
    if (cats.length !== ids.length)
      throw ApiError.badRequest(
        "One of the selected fee categories is missing or inactive",
      );

    const data = {
      dueDay: b.dueDay,
      fineType: b.fineType,
      graceDays: b.graceDays,
      fineAmount: b.fineType === "NONE" ? 0 : b.fineAmount,
    };
    const saved = await prisma.$transaction(async (tx) => {
      const s = await tx.feeStructure.upsert({
        where: {
          sessionId_classId: { sessionId: b.sessionId, classId: b.classId },
        },
        create: { sessionId: b.sessionId, classId: b.classId, ...data },
        update: data,
      });
      await tx.feeStructureItem.deleteMany({ where: { structureId: s.id } });
      await tx.feeStructureItem.createMany({
        data: b.items.map((i) => ({
          structureId: s.id,
          categoryId: i.categoryId,
          amount: i.amount,
        })),
      });
      // A category removed from the structure can no longer be overridden for students.
      await tx.studentFeeOverride.deleteMany({
        where: {
          assignment: { structureId: s.id },
          categoryId: { notIn: ids },
        },
      });
      return tx.feeStructure.findUniqueOrThrow({
        where: { id: s.id },
        include: structureInclude,
      });
    }, OPTS);

    await writeAudit(req, {
      action: "FEE_STRUCTURE_SAVED",
      entity: "fee_structures",
      entityId: saved.id,
      newValues: structureDto(saved),
    });
    ok(res, structureDto(saved));
  }),
);

// Copy every class structure from one session to another (classes that already have one are skipped).
feesRouter.post(
  "/structures/copy",
  authorize("fees", "CREATE"),
  validate(copySchema),
  h(async (req, res) => {
    const { fromSessionId, toSessionId, increasePercent } = req.body as {
      fromSessionId: string;
      toSessionId: string;
      increasePercent: number;
    };
    const [source, existing] = await Promise.all([
      prisma.feeStructure.findMany({
        where: { sessionId: fromSessionId },
        include: { items: true },
      }),
      prisma.feeStructure.findMany({
        where: { sessionId: toSessionId },
        select: { classId: true },
      }),
    ]);
    if (source.length === 0)
      throw ApiError.conflict(
        "The source session has no fee structures to copy",
      );
    const skip = new Set(existing.map((e) => e.classId));
    const factor = new Prisma.Decimal(100 + increasePercent).div(100);

    let copied = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of source) {
        if (skip.has(s.classId)) continue;
        await tx.feeStructure.create({
          data: {
            sessionId: toSessionId,
            classId: s.classId,
            dueDay: s.dueDay,
            fineType: s.fineType,
            fineAmount: s.fineAmount,
            graceDays: s.graceDays,
            items: {
              create: s.items.map((i) => ({
                categoryId: i.categoryId,
                amount: i.amount.mul(factor).toDecimalPlaces(2),
              })),
            },
          },
        });
        copied++;
      }
    }, OPTS);

    await writeAudit(req, {
      action: "FEE_STRUCTURES_COPIED",
      entity: "fee_structures",
      newValues: { fromSessionId, toSessionId, increasePercent, copied },
    });
    ok(res, { copied, skipped: source.length - copied }, 201);
  }),
);

// Restrict FK: refused with 409 while students are assigned to it.
feesRouter.delete(
  "/structures/:id",
  authorize("fees", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.feeStructure.delete({ where: { id: req.params.id } });
    await writeAudit(req, {
      action: "FEE_STRUCTURE_DELETED",
      entity: "fee_structures",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Assignments ===========================
feesRouter.get(
  "/assignments",
  authorize("fees", "VIEW"),
  validate(assignmentsQuerySchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as AssignmentsQuery;
    const where: Prisma.EnrollmentWhereInput = {
      sessionId: qy.sessionId,
      status: "ENROLLED",
      ...(qy.classId && { classId: qy.classId }),
      ...(qy.sectionId && { sectionId: qy.sectionId }),
      ...(qy.assigned && {
        feeAssignment: qy.assigned === "true" ? { isNot: null } : { is: null },
      }),
      student: {
        status: "ACTIVE",
        archivedAt: null,
        ...(qy.q && {
          OR: [
            { fullName: { contains: qy.q, mode: "insensitive" } },
            { admissionNo: { contains: qy.q, mode: "insensitive" } },
          ],
        }),
      },
    };

    const [rows, total] = await prisma.$transaction([
      prisma.enrollment.findMany({
        where,
        orderBy: [
          { class: { level: "asc" } },
          { section: { name: "asc" } },
          { rollNo: "asc" },
        ],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          student: { select: { id: true, admissionNo: true, fullName: true } },
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          feeAssignment: {
            include: {
              overrides: true,
              structure: { include: structureInclude },
            },
          },
        },
      }),
      prisma.enrollment.count({ where }),
    ]);

    const classStructures = await prisma.feeStructure.findMany({
      where: {
        sessionId: qy.sessionId,
        classId: { in: [...new Set(rows.map((r) => r.classId))] },
      },
      include: structureInclude,
    });
    const byClass = new Map(classStructures.map((s) => [s.classId, s]));

    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      items: rows.map((e) => {
        const a = e.feeAssignment;
        const classStructure = byClass.get(e.classId);
        const structure = a ? a.structure : classStructure;
        const eff = structure
          ? effectiveItems(structure.items, a?.overrides ?? [])
          : [];
        return {
          enrollmentId: e.id,
          rollNo: e.rollNo,
          student: e.student,
          class: e.class,
          section: e.section,
          assigned: !!a,
          hasStructure: !!classStructure,
          structureMismatch: !!a && a.structure.classId !== e.classId,
          overrideCount: a?.overrides.length ?? 0,
          monthlyTotal: monthlyTotal(eff).toFixed(2),
        };
      }),
    });
  }),
);

// One student's fees: class prices plus any overrides.
feesRouter.get(
  "/assignments/:enrollmentId",
  authorize("fees", "VIEW"),
  validate(enrollmentParam, "params"),
  h(async (req, res) => {
    const e = await prisma.enrollment.findUnique({
      where: { id: req.params.enrollmentId },
      include: {
        student: { select: { id: true, admissionNo: true, fullName: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        feeAssignment: { include: { overrides: true } },
      },
    });
    if (!e) throw ApiError.notFound("Enrollment not found");
    const structure = await prisma.feeStructure.findUnique({
      where: {
        sessionId_classId: { sessionId: e.sessionId, classId: e.classId },
      },
      include: structureInclude,
    });
    ok(res, {
      enrollmentId: e.id,
      student: e.student,
      class: e.class,
      section: e.section,
      assigned: !!e.feeAssignment,
      structureId: structure?.id ?? null,
      items: structure
        ? effectiveItems(structure.items, e.feeAssignment?.overrides ?? [])
        : [],
    });
  }),
);

// Assign the class structure to this student and replace their overrides.
feesRouter.put(
  "/assignments/:enrollmentId",
  authorize("fees", "EDIT"),
  validate(enrollmentParam, "params"),
  validate(assignmentUpdateSchema),
  h(async (req, res) => {
    const e = await prisma.enrollment.findUnique({
      where: { id: req.params.enrollmentId },
    });
    if (!e) throw ApiError.notFound("Enrollment not found");
    if (e.status !== "ENROLLED")
      throw ApiError.conflict(`This enrollment is ${e.status.toLowerCase()}`);

    const structure = await prisma.feeStructure.findUnique({
      where: {
        sessionId_classId: { sessionId: e.sessionId, classId: e.classId },
      },
      include: { items: true },
    });
    if (!structure)
      throw ApiError.conflict(
        "No fee structure is set for this class in this session. Set it under Fee Structure first.",
      );

    const overrides = req.body.overrides as {
      categoryId: string;
      amount: number;
      reason?: string;
    }[];
    const allowed = new Set(structure.items.map((i) => i.categoryId));
    if (overrides.some((o) => !allowed.has(o.categoryId)))
      throw ApiError.badRequest(
        "A custom fee does not belong to this class structure",
      );

    const assignment = await prisma.$transaction(async (tx) => {
      const a = await tx.studentFeeAssignment.upsert({
        where: { enrollmentId: e.id },
        create: { enrollmentId: e.id, structureId: structure.id },
        update: { structureId: structure.id },
      });
      await tx.studentFeeOverride.deleteMany({ where: { assignmentId: a.id } });
      if (overrides.length) {
        await tx.studentFeeOverride.createMany({
          data: overrides.map((o) => ({
            assignmentId: a.id,
            categoryId: o.categoryId,
            amount: o.amount,
            reason: o.reason,
          })),
        });
      }
      return a;
    }, OPTS);

    await writeAudit(req, {
      action: "FEE_ASSIGNMENT_SAVED",
      entity: "student_fee_assignments",
      entityId: assignment.id,
      newValues: { enrollmentId: e.id, structureId: structure.id, overrides },
    });
    ok(res, { id: assignment.id });
  }),
);

// Assign the class structure to every enrolled student who has none yet.
feesRouter.post(
  "/assignments/bulk",
  authorize("fees", "CREATE"),
  validate(bulkAssignSchema),
  h(async (req, res) => {
    const { sessionId, classId, sectionId } = req.body as {
      sessionId: string;
      classId: string;
      sectionId?: string;
    };
    const structure = await prisma.feeStructure.findUnique({
      where: { sessionId_classId: { sessionId, classId } },
    });
    if (!structure)
      throw ApiError.conflict(
        "No fee structure is set for this class in this session. Set it under Fee Structure first.",
      );

    const pending = await prisma.enrollment.findMany({
      where: {
        sessionId,
        classId,
        ...(sectionId && { sectionId }),
        status: "ENROLLED",
        student: { status: "ACTIVE", archivedAt: null },
        feeAssignment: { is: null },
      },
      select: { id: true },
    });
    const result = await prisma.studentFeeAssignment.createMany({
      data: pending.map((p) => ({
        enrollmentId: p.id,
        structureId: structure.id,
      })),
      skipDuplicates: true,
    });
    await writeAudit(req, {
      action: "FEE_ASSIGNED_BULK",
      entity: "student_fee_assignments",
      newValues: { sessionId, classId, sectionId, assigned: result.count },
    });
    ok(res, { assigned: result.count }, 201);
  }),
);
feesRouter.use("/invoices", invoicesRouter);
feesRouter.use("/discounts", discountsRouter);

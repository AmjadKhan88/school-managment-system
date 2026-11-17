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
import { bandRanges, validateBands } from "./grading.calc";
import {
  dateSheetQuerySchema,
  examListSchema,
  examSchema,
  ExamInput,
  scaleSchema,
  ScaleInput,
  scheduleQuerySchema,
  scheduleSchema,
  ScheduleInput,
  statusSchema,
} from "./exams.schema";
import {
  createExam,
  dateSheet,
  saveSchedule,
  setStatus,
  syncSubjects,
  updateExam,
} from "./exams.service";

// =========================== Grading scales ===========================
export const gradingRouter = Router();
const bandData = (bands: ScaleInput["bands"]) =>
  bands.map((b) => ({
    grade: b.grade,
    minPercent: b.minPercent,
    gradePoint: b.gradePoint,
    remark: b.remark ?? null,
  }));

gradingRouter.get(
  "/scales",
  authorize("academics", "VIEW"),
  h(async (_req, res) => {
    const scales = await prisma.gradingScale.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { bands: true, _count: { select: { exams: true } } },
    });
    ok(
      res,
      scales.map((s) => ({
        id: s.id,
        name: s.name,
        isDefault: s.isDefault,
        isActive: s.isActive,
        examCount: s._count.exams,
        bands: bandRanges(
          s.bands.map((b) => ({
            id: b.id,
            grade: b.grade,
            minPercent: Number(b.minPercent),
            gradePoint: Number(b.gradePoint),
            remark: b.remark,
          })),
        ),
      })),
    );
  }),
);

gradingRouter.post(
  "/scales",
  authorize("academics", "CREATE"),
  validate(scaleSchema),
  h(async (req, res) => {
    const b = req.body as ScaleInput;
    const problems = validateBands(b.bands);
    if (problems.length) throw ApiError.badRequest(problems.join(". "));
    const row = await prisma.gradingScale.create({
      data: {
        name: b.name,
        isActive: b.isActive ?? true,
        isDefault: false,
        bands: { create: bandData(b.bands) },
      },
      select: { id: true },
    });
    await writeAudit(req, {
      action: "GRADING_SCALE_CREATED",
      entity: "grading_scales",
      entityId: row.id,
      newValues: b,
    });
    ok(res, row, 201);
  }),
);

gradingRouter.put(
  "/scales/:id",
  authorize("academics", "EDIT"),
  validate(idParam, "params"),
  validate(scaleSchema),
  h(async (req, res) => {
    const b = req.body as ScaleInput;
    const problems = validateBands(b.bands);
    if (problems.length) throw ApiError.badRequest(problems.join(". "));
    const found = await prisma.gradingScale.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Grading scale not found");
    if (found.isDefault && b.isActive === false)
      throw ApiError.conflict("The default scale cannot be deactivated");

    await prisma.$transaction(async (tx) => {
      await tx.gradingScale.update({
        where: { id: found.id },
        data: {
          name: b.name,
          ...(b.isActive !== undefined && { isActive: b.isActive }),
        },
      });
      await tx.gradeBand.deleteMany({ where: { scaleId: found.id } });
      await tx.gradeBand.createMany({
        data: bandData(b.bands).map((x) => ({ ...x, scaleId: found.id })),
      });
    });
    await writeAudit(req, {
      action: "GRADING_SCALE_UPDATED",
      entity: "grading_scales",
      entityId: found.id,
      newValues: b,
    });
    ok(res, { id: found.id });
  }),
);

gradingRouter.post(
  "/scales/:id/default",
  authorize("academics", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const found = await prisma.gradingScale.findUnique({
      where: { id: req.params.id },
    });
    if (!found || !found.isActive)
      throw ApiError.notFound("Grading scale not found or inactive");
    await prisma.$transaction([
      prisma.gradingScale.updateMany({ data: { isDefault: false } }),
      prisma.gradingScale.update({
        where: { id: found.id },
        data: { isDefault: true },
      }),
    ]);
    await writeAudit(req, {
      action: "GRADING_SCALE_DEFAULT",
      entity: "grading_scales",
      entityId: found.id,
    });
    ok(res, { id: found.id });
  }),
);

// Restrict FK: refused with 409 once an exam uses the scale.
gradingRouter.delete(
  "/scales/:id",
  authorize("academics", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const found = await prisma.gradingScale.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Grading scale not found");
    if (found.isDefault)
      throw ApiError.conflict(
        "The default scale cannot be deleted. Make another scale the default first.",
      );
    await prisma.gradingScale.delete({ where: { id: found.id } });
    await writeAudit(req, {
      action: "GRADING_SCALE_DELETED",
      entity: "grading_scales",
      entityId: found.id,
    });
    ok(res, { id: found.id });
  }),
);

// =========================== Exams ===========================
export const examsRouter = Router();

examsRouter.get(
  "/",
  authorize("exams", "VIEW"),
  validate(examListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as {
      sessionId?: string;
      status?: "DRAFT" | "PUBLISHED" | "COMPLETED";
      type?: string;
    };
    const where: Prisma.ExamWhereInput = {
      ...(qy.sessionId && { sessionId: qy.sessionId }),
      ...(qy.status && { status: qy.status }),
      ...(qy.type && { type: qy.type as never }),
    };
    const [exams, papers, scheduled] = await Promise.all([
      prisma.exam.findMany({
        where,
        orderBy: [{ startDate: "desc" }, { name: "asc" }],
        include: {
          session: { select: { name: true } },
          gradingScale: { select: { name: true } },
          classes: {
            include: { class: { select: { name: true, level: true } } },
          },
        },
      }),
      prisma.examSubject.groupBy({
        by: ["examId"],
        _count: { _all: true },
        where: { exam: where },
      }),
      prisma.examSubject.groupBy({
        by: ["examId"],
        _count: { _all: true },
        where: {
          exam: where,
          examDate: { not: null },
          startTime: { not: null },
        },
      }),
    ]);
    const total = new Map(papers.map((p) => [p.examId, p._count._all]));
    const done = new Map(scheduled.map((p) => [p.examId, p._count._all]));
    ok(
      res,
      exams.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        status: e.status,
        sessionId: e.sessionId,
        sessionName: e.session.name,
        startDate: e.startDate,
        endDate: e.endDate,
        gradingScaleId: e.gradingScaleId,
        gradingScaleName: e.gradingScale?.name ?? null,
        notes: e.notes,
        classes: e.classes
          .sort((a, b) => a.class.level - b.class.level)
          .map((c) => ({
            classId: c.classId,
            className: c.class.name,
            totalMarks: c.totalMarks,
            passingMarks: c.passingMarks,
          })),
        papers: total.get(e.id) ?? 0,
        scheduled: done.get(e.id) ?? 0,
      })),
    );
  }),
);

examsRouter.post(
  "/",
  authorize("exams", "CREATE"),
  validate(examSchema),
  h(async (req, res) => {
    const result = await createExam(req.body as ExamInput, req.user!.id);
    await writeAudit(req, {
      action: "EXAM_CREATED",
      entity: "exams",
      entityId: result.id,
      newValues: req.body,
    });
    ok(res, result, 201);
  }),
);

examsRouter.put(
  "/:id",
  authorize("exams", "EDIT"),
  validate(idParam, "params"),
  validate(examSchema),
  h(async (req, res) => {
    const result = await updateExam(req.params.id, req.body as ExamInput);
    await writeAudit(req, {
      action: "EXAM_UPDATED",
      entity: "exams",
      entityId: req.params.id,
      newValues: req.body,
    });
    ok(res, result);
  }),
);

// Only a draft exam can be deleted. Marks entry will add its own guard in the next step.
examsRouter.delete(
  "/:id",
  authorize("exams", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const e = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!e) throw ApiError.notFound("Exam not found");
    if (e.status !== "DRAFT")
      throw ApiError.conflict(
        "Only draft exams can be deleted. Unpublish it first.",
      );
    await prisma.exam.delete({ where: { id: e.id } });
    await writeAudit(req, {
      action: "EXAM_DELETED",
      entity: "exams",
      entityId: e.id,
      oldValues: e,
    });
    ok(res, { id: e.id });
  }),
);

examsRouter.post(
  "/:id/status",
  authorize("exams", "APPROVE"),
  validate(idParam, "params"),
  validate(statusSchema),
  h(async (req, res) => {
    const r = await setStatus(req.params.id, req.body.status);
    await writeAudit(req, {
      action: "EXAM_STATUS",
      entity: "exams",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r);
  }),
);

examsRouter.post(
  "/:id/sync",
  authorize("exams", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await syncSubjects(req.params.id);
    await writeAudit(req, {
      action: "EXAM_SYNCED",
      entity: "exams",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r);
  }),
);

examsRouter.get(
  "/:id/schedule",
  authorize("exams", "VIEW"),
  validate(idParam, "params"),
  validate(scheduleQuerySchema, "query"),
  h(async (req, res) => {
    const classId = (req.query as { classId: string }).classId;
    const papers = await prisma.examSubject.findMany({
      where: { examId: req.params.id, classId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: [
        { examDate: { sort: "asc", nulls: "last" } },
        { startTime: "asc" },
      ],
    });
    ok(
      res,
      papers.map((p) => ({
        subjectId: p.subjectId,
        subjectName: p.subject.name,
        subjectCode: p.subject.code,
        examDate: p.examDate ? p.examDate.toISOString().slice(0, 10) : null,
        startTime: p.startTime,
        endTime: p.endTime,
        room: p.room,
        totalMarks: p.totalMarks,
        practicalMarks: p.practicalMarks,
        passingMarks: p.passingMarks,
      })),
    );
  }),
);

examsRouter.put(
  "/:id/schedule",
  authorize("exams", "EDIT"),
  validate(idParam, "params"),
  validate(scheduleSchema),
  h(async (req, res) => {
    const r = await saveSchedule(req.params.id, req.body as ScheduleInput);
    await writeAudit(req, {
      action: "EXAM_SCHEDULE_SAVED",
      entity: "exams",
      entityId: req.params.id,
      newValues: { classId: req.body.classId, papers: r.updated },
    });
    ok(res, r);
  }),
);

examsRouter.get(
  "/:id/date-sheet",
  authorize("exams", "PRINT"),
  validate(idParam, "params"),
  validate(dateSheetQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await dateSheet(
        req.params.id,
        (req.query as { classId?: string }).classId,
      ),
    ),
  ),
);

import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize, tenant } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import * as s from "./academics.schema";

export const academicsRouter = Router();
const ok = (res: any, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

// ---------- Academic sessions ----------
academicsRouter.get(
  "/sessions",
  authorize("academics", "VIEW"),
  h(async (req, res) =>
    ok(
      res,
      await prisma.academicSession.findMany({
        where: tenant(req),
        orderBy: { startDate: "desc" },
      }),
    ),
  ),
);

academicsRouter.post(
  "/sessions",
  authorize("academics", "CREATE"),
  validate(s.sessionSchema),
  h(async (req, res) => {
    const row = await prisma.academicSession.create({
      data: { ...req.body, schoolId: req.user!.schoolId },
    });
    await writeAudit(req, {
      action: "SESSION_CREATED",
      entity: "academic_sessions",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);

academicsRouter.put(
  "/sessions/:id",
  authorize("academics", "EDIT"),
  validate(s.idParam, "params"),
  validate(s.sessionSchema),
  h(async (req, res) => {
    const found = await prisma.academicSession.findFirst({
      where: { id: req.params.id, ...tenant(req) },
    });
    if (!found) throw ApiError.notFound("Session not found");
    ok(
      res,
      await prisma.academicSession.update({
        where: { id: found.id },
        data: req.body,
      }),
    );
  }),
);

// Exactly one active session; done in one transaction.
academicsRouter.post(
  "/sessions/:id/activate",
  authorize("academics", "EDIT"),
  validate(s.idParam, "params"),
  h(async (req, res) => {
    const found = await prisma.academicSession.findFirst({
      where: { id: req.params.id, ...tenant(req) },
    });
    if (!found) throw ApiError.notFound("Session not found");
    await prisma.$transaction([
      prisma.academicSession.updateMany({
        where: tenant(req),
        data: { isActive: false },
      }),
      prisma.academicSession.update({
        where: { id: found.id },
        data: { isActive: true },
      }),
    ]);
    await writeAudit(req, {
      action: "SESSION_ACTIVATED",
      entity: "academic_sessions",
      entityId: found.id,
    });
    ok(res, { id: found.id, isActive: true });
  }),
);

// ---------- Classes ----------
academicsRouter.get(
  "/classes",
  authorize("academics", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.class.findMany({
        orderBy: { level: "asc" },
        include: { _count: { select: { sections: true } } },
      }),
    ),
  ),
);

academicsRouter.post(
  "/classes",
  authorize("academics", "CREATE"),
  validate(s.classSchema),
  h(async (req, res) =>
    ok(res, await prisma.class.create({ data: req.body }), 201),
  ),
);

academicsRouter.put(
  "/classes/:id",
  authorize("academics", "EDIT"),
  validate(s.idParam, "params"),
  validate(s.classSchema),
  h(async (req, res) =>
    ok(
      res,
      await prisma.class.update({
        where: { id: req.params.id },
        data: req.body,
      }),
    ),
  ),
);

academicsRouter.delete(
  "/classes/:id",
  authorize("academics", "DELETE"),
  validate(s.idParam, "params"),
  h(async (req, res) => {
    await prisma.class.delete({ where: { id: req.params.id } }); // Restrict FK: refused if sections exist
    ok(res, { id: req.params.id });
  }),
);

// ---------- Sections ----------
academicsRouter.get(
  "/sections",
  authorize("academics", "VIEW"),
  h(async (req, res) =>
    ok(
      res,
      await prisma.section.findMany({
        where:
          typeof req.query.classId === "string"
            ? { classId: req.query.classId }
            : {},
        orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
        include: { class: { select: { id: true, name: true } } },
      }),
    ),
  ),
);

academicsRouter.post(
  "/sections",
  authorize("academics", "CREATE"),
  validate(s.sectionSchema),
  h(async (req, res) =>
    ok(res, await prisma.section.create({ data: req.body }), 201),
  ),
);

academicsRouter.put(
  "/sections/:id",
  authorize("academics", "EDIT"),
  validate(s.idParam, "params"),
  validate(s.sectionSchema),
  h(async (req, res) =>
    ok(
      res,
      await prisma.section.update({
        where: { id: req.params.id },
        data: req.body,
      }),
    ),
  ),
);

academicsRouter.delete(
  "/sections/:id",
  authorize("academics", "DELETE"),
  validate(s.idParam, "params"),
  h(async (req, res) => {
    await prisma.section.delete({ where: { id: req.params.id } });
    ok(res, { id: req.params.id });
  }),
);

// ---------- Subjects ----------
academicsRouter.get(
  "/subjects",
  authorize("academics", "VIEW"),
  h(async (_req, res) =>
    ok(res, await prisma.subject.findMany({ orderBy: { name: "asc" } })),
  ),
);

academicsRouter.post(
  "/subjects",
  authorize("academics", "CREATE"),
  validate(s.subjectSchema),
  h(async (req, res) =>
    ok(res, await prisma.subject.create({ data: req.body }), 201),
  ),
);

academicsRouter.put(
  "/subjects/:id",
  authorize("academics", "EDIT"),
  validate(s.idParam, "params"),
  validate(s.subjectSchema),
  h(async (req, res) =>
    ok(
      res,
      await prisma.subject.update({
        where: { id: req.params.id },
        data: req.body,
      }),
    ),
  ),
);

academicsRouter.delete(
  "/subjects/:id",
  authorize("academics", "DELETE"),
  validate(s.idParam, "params"),
  h(async (req, res) => {
    await prisma.subject.delete({ where: { id: req.params.id } });
    ok(res, { id: req.params.id });
  }),
);

// ---------- Class-subject mapping ----------
academicsRouter.get(
  "/classes/:id/subjects",
  authorize("academics", "VIEW"),
  validate(s.idParam, "params"),
  h(async (req, res) =>
    ok(
      res,
      await prisma.classSubject.findMany({
        where: { classId: req.params.id },
        include: { subject: true },
      }),
    ),
  ),
);

academicsRouter.put(
  "/classes/:id/subjects",
  authorize("academics", "EDIT"),
  validate(s.idParam, "params"),
  validate(s.classSubjectsSchema),
  h(async (req, res) => {
    const classId = req.params.id as string;
    const ids: string[] = req.body.subjectIds;
    await prisma.$transaction([
      prisma.classSubject.deleteMany({ where: { classId } }),
      prisma.classSubject.createMany({
        data: ids.map((subjectId) => ({ classId, subjectId })),
        skipDuplicates: true,
      }),
    ]);
    ok(res, { classId, subjectIds: ids });
  }),
);

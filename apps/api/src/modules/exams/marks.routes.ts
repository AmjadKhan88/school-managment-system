import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import {
  gridQuerySchema,
  progressQuerySchema,
  publishSchema,
  resultsQuerySchema,
  saveGridSchema,
  SaveGrid,
  unpublishSchema,
} from "./marks.schema";
import {
  exportGrid,
  loadGrid,
  parseImport,
  progress,
  saveGrid,
} from "./marks.service";
import {
  loadClassResults,
  publishResults,
  unpublishResults,
} from "./results.service";
import { prisma } from "../../config/prisma";
import {
  scopeFor,
  sectionsForSubject,
  subjectSectionsInClass,
} from "../staff/scope";

// =========================== Marks entry ===========================
export const marksRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
const receive = (req: Request, res: Response, next: NextFunction) =>
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    next(
      ApiError.badRequest(
        (err as { code?: string }).code === "LIMIT_FILE_SIZE"
          ? "The file is too large (2 MB maximum)"
          : "The upload failed",
      ),
    );
  });

/** For a scoped teacher: the sections they teach this subject in. undefined = unrestricted. */
async function allowedSections(
  req: Request,
  examId: string,
  classId: string,
  subjectId: string,
): Promise<Set<string> | undefined> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { sessionId: true },
  });
  if (!exam) return undefined; // the service reports "exam not found"
  const scope = await scopeFor(req.user!, exam.sessionId);
  if (!scope) return undefined;
  const sections = sectionsForSubject(scope, classId, subjectId);
  if (sections.size === 0)
    throw ApiError.forbidden(
      "You are not assigned to teach this subject in this class",
    );
  return sections;
}

marksRouter.get(
  "/progress",
  authorize("marks", "VIEW"),
  validate(progressQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as { examId: string; classId: string };
    const exam = await prisma.exam.findUnique({
      where: { id: q.examId },
      select: { sessionId: true },
    });
    const scope = exam ? await scopeFor(req.user!, exam.sessionId) : null;
    ok(
      res,
      await progress(
        q.examId,
        q.classId,
        scope ? subjectSectionsInClass(scope, q.classId) : undefined,
      ),
    );
  }),
);

marksRouter.get(
  "/grid",
  authorize("marks", "VIEW"),
  validate(gridQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      examId: string;
      classId: string;
      subjectId: string;
    };
    ok(
      res,
      await loadGrid(
        q.examId,
        q.classId,
        q.subjectId,
        await allowedSections(req, q.examId, q.classId, q.subjectId),
      ),
    );
  }),
);

marksRouter.put(
  "/grid",
  authorize("marks", "CREATE"),
  validate(saveGridSchema),
  h(async (req, res) => {
    const b = req.body as SaveGrid;
    const onlySections = await allowedSections(
      req,
      b.examId,
      b.classId,
      b.subjectId,
    );
    const result = await saveGrid(b, {
      id: req.user!.id,
      canEdit: req.user!.permissions.has("marks:EDIT"),
      onlySections,
    });
    if (result.created + result.updated + result.cleared > 0) {
      await writeAudit(req, {
        action: "MARKS_SAVED",
        entity: "exam_marks",
        newValues: {
          examId: b.examId,
          classId: b.classId,
          subjectId: b.subjectId,
          ...result,
        },
      });
    }
    ok(res, result);
  }),
);

marksRouter.get(
  "/export",
  authorize("marks", "EXPORT"),
  validate(gridQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      examId: string;
      classId: string;
      subjectId: string;
    };
    const f = await exportGrid(
      q.examId,
      q.classId,
      q.subjectId,
      await allowedSections(req, q.examId, q.classId, q.subjectId),
    );
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "exam_marks",
      newValues: { ...q, rows: f.rows.length },
    });
    await sendXlsx(res, f.filename, f.sheet, f.columns, f.rows);
  }),
);

marksRouter.post(
  "/import/parse",
  authorize("marks", "CREATE"),
  receive,
  validate(gridQuerySchema),
  h(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest("Choose an Excel file");
    if (
      !/\.xlsx$/i.test(file.originalname) ||
      file.buffer.subarray(0, 2).toString("latin1") !== "PK"
    )
      throw ApiError.badRequest("Upload an Excel (.xlsx) file");
    const b = req.body as {
      examId: string;
      classId: string;
      subjectId: string;
    };
    ok(
      res,
      await parseImport(
        file.buffer,
        b.examId,
        b.classId,
        b.subjectId,
        await allowedSections(req, b.examId, b.classId, b.subjectId),
      ),
    );
  }),
);

// =========================== Results ===========================
export const resultsRouter = Router();

resultsRouter.get(
  "/class",
  authorize("results", "VIEW"),
  validate(resultsQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      examId: string;
      classId: string;
      sectionId?: string;
    };
    ok(res, await loadClassResults(q.examId, q.classId, q.sectionId));
  }),
);

resultsRouter.get(
  "/class/export",
  authorize("results", "EXPORT"),
  validate(resultsQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      examId: string;
      classId: string;
      sectionId?: string;
    };
    const r = await loadClassResults(q.examId, q.classId, q.sectionId);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "exam_results",
      newValues: { ...q, rows: r.students.length },
    });

    const subjectCols = r.subjects.map((s) => ({
      header: `${s.name} (${s.totalMarks})`,
      key: `p${s.paperId}`,
      width: 14,
    }));
    const cell = (s: (typeof r.students)[number], paperId: string) => {
      const x = s.subjects.find((y) => y.paperId === paperId);
      return x?.status === "ABSENT"
        ? "Abs"
        : x?.status === "EXEMPT"
          ? "Ex"
          : x?.obtained !== null && x?.obtained !== undefined
            ? Number(x.obtained)
            : "";
    };
    await sendXlsx(
      res,
      `results-${r.exam.name}-${r.className}`.replace(/[^\w.-]+/g, "-"),
      `${r.className} results`.slice(0, 31),
      [
        { header: "Position", key: "pos", width: 10 },
        { header: "Roll", key: "roll", width: 8 },
        { header: "Admission no", key: "adm", width: 16 },
        { header: "Student", key: "name", width: 28 },
        { header: "Section", key: "sec", width: 9 },
        ...subjectCols,
        { header: "Total", key: "total", width: 10 },
        { header: "Out of", key: "max", width: 9 },
        { header: "%", key: "pct", width: 9 },
        { header: "Grade", key: "grade", width: 8 },
        { header: "GPA", key: "gpa", width: 8 },
        { header: "Result", key: "result", width: 12 },
      ],
      r.students.map((s) => ({
        pos: s.position ?? "",
        roll: s.rollNo ?? "",
        adm: s.admissionNo,
        name: s.fullName,
        sec: s.section,
        ...Object.fromEntries(
          r.subjects.map((p) => [`p${p.paperId}`, cell(s, p.paperId)]),
        ),
        total: Number(s.totalObtained),
        max: Number(s.totalMax),
        pct: s.percentage === null ? "" : Number(s.percentage),
        grade: s.grade ?? "",
        gpa: s.gpa === null ? "" : Number(s.gpa),
        result: s.result.charAt(0) + s.result.slice(1).toLowerCase(),
      })),
    );
  }),
);

// Publishing and unpublishing need the Approve permission on results.
resultsRouter.post(
  "/publish",
  authorize("results", "APPROVE"),
  validate(publishSchema),
  h(async (req, res) => {
    const r = await publishResults(
      req.body.examId,
      req.body.classId,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "RESULTS_PUBLISHED",
      entity: "exam_results",
      entityId: req.body.examId,
      newValues: { classId: req.body.classId, ...r },
    });
    ok(res, r, 201);
  }),
);

resultsRouter.post(
  "/unpublish",
  authorize("results", "APPROVE"),
  validate(unpublishSchema),
  h(async (req, res) => {
    const r = await unpublishResults(req.body.examId, req.body.classId);
    await writeAudit(req, {
      action: "RESULTS_UNPUBLISHED",
      entity: "exam_results",
      entityId: req.body.examId,
      newValues: { classId: req.body.classId, reason: req.body.reason, ...r },
    });
    ok(res, r);
  }),
);

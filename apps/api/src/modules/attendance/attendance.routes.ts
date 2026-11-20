import { Request, Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize, tenant } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import {
  registerQuerySchema,
  RegisterQuery,
  ReportQuery,
  reportParamSchema,
  reportQuerySchema,
  ReportType,
  saveRegisterSchema,
  SaveRegister,
} from "./attendance.schema";
import { loadRegister, saveRegister } from "./attendance.service";
import { buildReport } from "./reports.service";
import { scopeFor } from "../staff/scope";

export const attendanceRouter = Router();

/** A scoped teacher may take attendance only for the section they are class teacher of. */
async function guardRegister(
  req: Request,
  sessionId: string,
  classId: string,
  sectionId: string,
) {
  const scope = await scopeFor(req.user!, sessionId);
  if (
    scope &&
    !scope.classTeacher.some(
      (c) => c.classId === classId && c.sectionId === sectionId,
    )
  ) {
    throw ApiError.forbidden(
      "You can take attendance only for the section you are class teacher of",
    );
  }
}

attendanceRouter.get(
  "/register",
  authorize("attendance", "VIEW"),
  validate(registerQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as RegisterQuery;
    await guardRegister(req, q.sessionId, q.classId, q.sectionId);
    ok(res, await loadRegister(q));
  }),
);

attendanceRouter.put(
  "/register",
  authorize("attendance", "CREATE"),
  validate(saveRegisterSchema),
  h(async (req, res) => {
    const b = req.body as SaveRegister;
    await guardRegister(req, b.sessionId, b.classId, b.sectionId);
    const perms = req.user!.permissions;
    const result = await saveRegister(b, {
      id: req.user!.id,
      canEdit: perms.has("attendance:EDIT"),
      canApprove: perms.has("attendance:APPROVE"),
    });
    if (result.created + result.updated > 0) {
      await writeAudit(req, {
        action: "ATTENDANCE_SAVED",
        entity: "student_attendance",
        newValues: {
          date: b.date.toISOString().slice(0, 10),
          classId: b.classId,
          sectionId: b.sectionId,
          ...result,
        },
      });
    }
    ok(res, result);
  }),
);

/** The requested session, or the active one. */
async function sessionFor(req: Request) {
  const wanted = (req.query as { sessionId?: string }).sessionId;
  if (wanted) return wanted;
  const active = await prisma.academicSession.findFirst({
    where: { ...tenant(req), isActive: true },
    select: { id: true },
  });
  if (!active)
    throw ApiError.badRequest("Create and activate an academic session first");
  return active.id;
}

attendanceRouter.get(
  "/reports/:type",
  authorize("attendance", "VIEW"),
  validate(reportParamSchema, "params"),
  validate(reportQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await buildReport(
        req.params.type as ReportType,
        req.query as unknown as ReportQuery,
        await sessionFor(req),
      ),
    ),
  ),
);

attendanceRouter.get(
  "/reports/:type/export",
  authorize("attendance", "EXPORT"),
  validate(reportParamSchema, "params"),
  validate(reportQuerySchema, "query"),
  h(async (req, res) => {
    const type = req.params.type as ReportType;
    const r = await buildReport(
      type,
      req.query as unknown as ReportQuery,
      await sessionFor(req),
    );
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: `attendance_${type}`,
      newValues: { rows: r.rows.length },
    });
    await sendXlsx(
      res,
      `attendance-${type}-${new Date().toISOString().slice(0, 10)}`,
      r.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
      r.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 12,
      })),
      r.rows,
    );
  }),
);

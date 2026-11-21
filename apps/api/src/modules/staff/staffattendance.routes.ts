import { NextFunction, Request, Response, Router } from "express";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import {
  saveStaffRegisterSchema,
  SaveStaffRegister,
  staffRegisterQuerySchema,
  StaffRegisterQuery,
  staffReportParamSchema,
  staffReportQuerySchema,
  StaffReportQuery,
  StaffReportType,
} from "./staffattendance.schema";
import {
  buildStaffReport,
  loadStaffRegister,
  saveStaffRegister,
} from "./staffattendance.service";

export const staffAttendanceRouter = Router();

/** Staff attendance needs BOTH the attendance permission and the staff permission. */
const need =
  (...pairs: [string, string][]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    req.user && pairs.every(([m, a]) => req.user!.permissions.has(`${m}:${a}`))
      ? next()
      : next(ApiError.forbidden());

staffAttendanceRouter.get(
  "/register",
  need(["attendance", "VIEW"], ["staff", "VIEW"]),
  validate(staffRegisterQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await loadStaffRegister(req.query as unknown as StaffRegisterQuery),
    ),
  ),
);

staffAttendanceRouter.put(
  "/register",
  need(["attendance", "CREATE"], ["staff", "EDIT"]),
  validate(saveStaffRegisterSchema),
  h(async (req, res) => {
    const b = req.body as SaveStaffRegister;
    const perms = req.user!.permissions;
    const result = await saveStaffRegister(b, {
      id: req.user!.id,
      canEdit: perms.has("attendance:EDIT"),
      canApprove: perms.has("attendance:APPROVE"),
    });
    if (result.created + result.updated > 0) {
      await writeAudit(req, {
        action: "STAFF_ATTENDANCE_SAVED",
        entity: "staff_attendance",
        newValues: {
          date: b.date.toISOString().slice(0, 10),
          group: b.group,
          ...result,
        },
      });
    }
    ok(res, result);
  }),
);

staffAttendanceRouter.get(
  "/reports/:type",
  need(["attendance", "VIEW"], ["staff", "VIEW"]),
  validate(staffReportParamSchema, "params"),
  validate(staffReportQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await buildStaffReport(
        req.params.type as StaffReportType,
        req.query as unknown as StaffReportQuery,
      ),
    ),
  ),
);

staffAttendanceRouter.get(
  "/reports/:type/export",
  need(["attendance", "EXPORT"], ["staff", "VIEW"]),
  validate(staffReportParamSchema, "params"),
  validate(staffReportQuerySchema, "query"),
  h(async (req, res) => {
    const type = req.params.type as StaffReportType;
    const r = await buildStaffReport(
      type,
      req.query as unknown as StaffReportQuery,
    );
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: `staff_attendance_${type}`,
      newValues: { rows: r.rows.length },
    });
    await sendXlsx(
      res,
      `staff-attendance-${type}-${new Date().toISOString().slice(0, 10)}`,
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

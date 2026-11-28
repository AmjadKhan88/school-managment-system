import { Router } from "express";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { leaveSchema, LeaveInput } from "../leaves/leaves.schema";
import {
  attendanceQuerySchema,
  cancelLeaveSchema,
  childQuerySchema,
  reportCardQuerySchema,
} from "./portal.schema";
import {
  applyLeave,
  assertChild,
  attendanceFor,
  cancelLeave,
  examScheduleFor,
  feesFor,
  leavesFor,
  libraryFor,
  linkedStudents,
  overviewFor,
  profileFor,
  reportCardFor,
  resultsFor,
  timetableFor,
} from "./portal.service";
import { transportFor } from "../transport/transport.service";

/**
 * Student and parent portal. Mounted at /portal behind `authenticate`.
 * There is no permission module here: access is decided by the link between the login and the student,
 * and every route re-checks that link (assertChild) before reading anything.
 */
export const portalRouter = Router();
const sid = (req: { query: unknown }) =>
  (req.query as { studentId: string }).studentId;

portalRouter.get(
  "/children",
  h(async (req, res) => ok(res, await linkedStudents(req.user!.id))),
);

portalRouter.get(
  "/overview",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await overviewFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.get(
  "/profile",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await profileFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.get(
  "/attendance",
  validate(attendanceQuerySchema, "query"),
  h(async (req, res) => {
    const child = await assertChild(req.user!.id, sid(req));
    ok(
      res,
      await attendanceFor(child, (req.query as { month?: string }).month),
    );
  }),
);

portalRouter.get(
  "/fees",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await feesFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.get(
  "/results",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await resultsFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.get(
  "/report-card",
  validate(reportCardQuerySchema, "query"),
  h(async (req, res) => {
    const child = await assertChild(req.user!.id, sid(req));
    const { examId } = req.query as unknown as { examId: string };
    const data = await reportCardFor(req.user!.schoolId, child, examId);
    await writeAudit(req, {
      action: "PORTAL_REPORT_CARD_VIEWED",
      entity: "exam_results",
      entityId: examId,
      newValues: { studentId: child.id },
    });
    ok(res, data);
  }),
);

portalRouter.get(
  "/timetable",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await timetableFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.get(
  "/exam-schedule",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await examScheduleFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.get(
  "/library",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await libraryFor(
        req.user!.schoolId,
        await assertChild(req.user!.id, sid(req)),
      ),
    ),
  ),
);

// ---- Leave ----
portalRouter.get(
  "/leaves",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await leavesFor(await assertChild(req.user!.id, sid(req)))),
  ),
);

portalRouter.post(
  "/leaves",
  validate(leaveSchema),
  h(async (req, res) => {
    const b = req.body as LeaveInput;
    const child = await assertChild(req.user!.id, b.studentId);
    const r = await applyLeave(req.user!.id, child, b);
    await writeAudit(req, {
      action: "LEAVE_APPLIED",
      entity: "leave_applications",
      entityId: r.id,
      newValues: { ...b, applicationNo: r.applicationNo, via: "portal" },
    });
    ok(res, r, 201);
  }),
);

portalRouter.post(
  "/leaves/:id/cancel",
  validate(idParam, "params"),
  validate(cancelLeaveSchema),
  h(async (req, res) => {
    const child = await assertChild(req.user!.id, req.body.studentId);
    const r = await cancelLeave(req.user!.id, child, req.params.id);
    await writeAudit(req, {
      action: "LEAVE_CANCELLED",
      entity: "leave_applications",
      entityId: r.id,
      newValues: { via: "portal" },
    });
    ok(res, r);
  }),
);

portalRouter.get(
  "/transport",
  validate(childQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await transportFor((await assertChild(req.user!.id, sid(req))).id)),
  ),
);

import { Response, Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { receiveFiles } from "./files";
import {
  cancelSchema,
  homeworkEditSchema,
  HomeworkEdit,
  homeworkSchema,
  HomeworkInput,
  idsParamSchema,
  listSchema,
  ListQuery,
  recordSchema,
  reviewSchema,
  ReviewInput,
  sessionQuerySchema,
} from "./homework.schema";
import {
  addAttachments,
  attachmentFile,
  cancelHomework,
  createHomework,
  editHomework,
  homeworkDetail,
  listHomework,
  options,
  recordSubmission,
  removeAttachment,
  resetSubmission,
  reviewSubmission,
  submissionFile,
} from "./homework.service";
import { Track } from "./homework.calc";

export const homeworkRouter = Router();
const files = (req: { files?: unknown }) =>
  (req.files as Express.Multer.File[] | undefined) ?? [];
const TRACK_LABEL: Record<Track, string> = {
  PENDING: "Not submitted",
  OVERDUE: "Overdue",
  SUBMITTED: "Submitted",
  LATE: "Submitted late",
  CHECKED: "Checked",
  REDO: "Redo needed",
};

export function sendStored(
  res: Response,
  f: { path: string; name: string; mime: string },
) {
  res.setHeader("Content-Type", f.mime);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  );
  res.sendFile(f.path, (err) => {
    if (err && !res.headersSent)
      res
        .status(404)
        .json({ success: false, message: "The file is missing on the server" });
  });
}

homeworkRouter.get(
  "/options",
  authorize("homework", "VIEW"),
  validate(sessionQuerySchema, "query"),
  h(async (req, res) => {
    const sessionId = (req.query as { sessionId?: string }).sessionId;
    if (!sessionId) throw ApiError.badRequest("Choose a session");
    ok(res, await options(req.user!, sessionId));
  }),
);

homeworkRouter.get(
  "/",
  authorize("homework", "VIEW"),
  validate(listSchema, "query"),
  h(async (req, res) =>
    ok(res, await listHomework(req.user!, req.query as unknown as ListQuery)),
  ),
);

homeworkRouter.post(
  "/",
  authorize("homework", "CREATE"),
  receiveFiles,
  validate(homeworkSchema),
  h(async (req, res) => {
    const r = await createHomework(
      req.user!,
      req.body as HomeworkInput,
      files(req),
    );
    await writeAudit(req, {
      action: "HOMEWORK_ASSIGNED",
      entity: "homework",
      entityId: r.created[0]?.id,
      newValues: {
        title: req.body.title,
        homework: r.created.map((c) => c.homeworkNo),
      },
    });
    ok(res, r, 201);
  }),
);

// Files: above /:id
homeworkRouter.get(
  "/attachments/:id",
  authorize("homework", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) =>
    sendStored(res, await attachmentFile(req.user!, req.params.id)),
  ),
);
homeworkRouter.delete(
  "/attachments/:id",
  authorize("homework", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await removeAttachment(req.user!, req.params.id);
    await writeAudit(req, {
      action: "HOMEWORK_ATTACHMENT_REMOVED",
      entity: "homework_attachments",
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);
homeworkRouter.get(
  "/submission-files/:id",
  authorize("homework", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) =>
    sendStored(res, await submissionFile(req.user!, req.params.id)),
  ),
);

homeworkRouter.get(
  "/:id",
  authorize("homework", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) =>
    ok(res, await homeworkDetail(req.user!, req.params.id)),
  ),
);

homeworkRouter.get(
  "/:id/export",
  authorize("homework", "EXPORT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const d = await homeworkDetail(req.user!, req.params.id);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "homework",
      entityId: d.id,
      newValues: { rows: d.rows.length },
    });
    await sendXlsx(
      res,
      `homework-${d.homeworkNo}`,
      "Completion",
      [
        { header: "Roll", key: "roll", width: 8 },
        { header: "Admission no", key: "adm", width: 16 },
        { header: "Student", key: "name", width: 28 },
        { header: "Status", key: "status", width: 16 },
        { header: "Submitted", key: "at", width: 18 },
        { header: "Marks", key: "marks", width: 8 },
        { header: "Feedback", key: "fb", width: 40 },
      ],
      d.rows.map((r) => ({
        roll: r.rollNo ?? "",
        adm: r.admissionNo,
        name: r.fullName,
        status: TRACK_LABEL[r.track],
        at: r.submission
          ? r.submission.submittedAt
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")
          : "",
        marks: r.submission?.marks ?? "",
        fb: r.submission?.feedback ?? "",
      })),
    );
  }),
);

homeworkRouter.put(
  "/:id",
  authorize("homework", "EDIT"),
  validate(idParam, "params"),
  validate(homeworkEditSchema),
  h(async (req, res) => {
    const r = await editHomework(
      req.user!,
      req.params.id,
      req.body as HomeworkEdit,
    );
    await writeAudit(req, {
      action: "HOMEWORK_UPDATED",
      entity: "homework",
      entityId: req.params.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);
homeworkRouter.post(
  "/:id/attachments",
  authorize("homework", "EDIT"),
  validate(idParam, "params"),
  receiveFiles,
  h(async (req, res) => {
    const r = await addAttachments(req.user!, req.params.id, files(req));
    await writeAudit(req, {
      action: "HOMEWORK_ATTACHMENT_ADDED",
      entity: "homework",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r, 201);
  }),
);
homeworkRouter.post(
  "/:id/cancel",
  authorize("homework", "EDIT"),
  validate(idParam, "params"),
  validate(cancelSchema),
  h(async (req, res) => {
    const r = await cancelHomework(req.user!, req.params.id, req.body.reason);
    await writeAudit(req, {
      action: "HOMEWORK_CANCELLED",
      entity: "homework",
      entityId: req.params.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, r);
  }),
);

homeworkRouter.post(
  "/:id/submissions/:studentId/record",
  authorize("homework", "EDIT"),
  validate(idsParamSchema, "params"),
  receiveFiles,
  validate(recordSchema),
  h(async (req, res) => {
    const r = await recordSubmission(
      req.user!,
      req.params.id,
      req.params.studentId,
      req.body,
      files(req),
    );
    await writeAudit(req, {
      action: "HOMEWORK_SUBMISSION_RECORDED",
      entity: "homework_submissions",
      entityId: r.id,
      newValues: { homeworkId: req.params.id, studentId: req.params.studentId },
    });
    ok(res, r, 201);
  }),
);
homeworkRouter.put(
  "/:id/submissions/:studentId/review",
  authorize("homework", "EDIT"),
  validate(idsParamSchema, "params"),
  validate(reviewSchema),
  h(async (req, res) => {
    const r = await reviewSubmission(
      req.user!,
      req.params.id,
      req.params.studentId,
      req.body as ReviewInput,
    );
    await writeAudit(req, {
      action: "HOMEWORK_REVIEWED",
      entity: "homework_submissions",
      entityId: r.id,
      newValues: {
        homeworkId: req.params.id,
        studentId: req.params.studentId,
        status: r.status,
        marks: req.body.marks,
      },
    });
    ok(res, r);
  }),
);
homeworkRouter.post(
  "/:id/submissions/:studentId/reset",
  authorize("homework", "EDIT"),
  validate(idsParamSchema, "params"),
  h(async (req, res) => {
    const r = await resetSubmission(
      req.user!,
      req.params.id,
      req.params.studentId,
    );
    await writeAudit(req, {
      action: "HOMEWORK_SUBMISSION_REMOVED",
      entity: "homework_submissions",
      entityId: r.id,
      newValues: { homeworkId: req.params.id, studentId: req.params.studentId },
    });
    ok(res, r);
  }),
);

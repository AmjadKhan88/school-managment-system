import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import {
  archiveSchema,
  inboxListSchema,
  InboxQuery,
  noticeListSchema,
  NoticeListQuery,
  noticeSchema,
  NoticeInput,
} from "./communication.schema";
import {
  activeClasses,
  archiveNotice,
  createNotice,
  inbox,
  listNotices,
  markRead,
  publishNotice,
  removeNotice,
  unreadCount,
  updateNotice,
} from "./notices.service";
import { messagesRouter } from "./messages.routes";

// =========================== Staff: manage notices (/communication) ===========================
export const communicationRouter = Router();

communicationRouter.use("/messages", messagesRouter);

communicationRouter.get(
  "/classes",
  authorize("communication", "VIEW"),
  h(async (_req, res) => ok(res, await activeClasses())),
);
communicationRouter.get(
  "/notices",
  authorize("communication", "VIEW"),
  validate(noticeListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listNotices(req.query as unknown as NoticeListQuery)),
  ),
);

communicationRouter.post(
  "/notices",
  authorize("communication", "CREATE"),
  validate(noticeSchema),
  h(async (req, res) => {
    const r = await createNotice(req.user!.id, req.body as NoticeInput);
    await writeAudit(req, {
      action: "NOTICE_CREATED",
      entity: "notices",
      entityId: r.id,
      newValues: {
        noticeNo: r.noticeNo,
        title: req.body.title,
        audience: req.body.audience,
      },
    });
    ok(res, r, 201);
  }),
);
communicationRouter.put(
  "/notices/:id",
  authorize("communication", "EDIT"),
  validate(idParam, "params"),
  validate(noticeSchema),
  h(async (req, res) => {
    const r = await updateNotice(req.params.id, req.body as NoticeInput);
    await writeAudit(req, {
      action: "NOTICE_UPDATED",
      entity: "notices",
      entityId: r.id,
      newValues: { title: req.body.title, audience: req.body.audience },
    });
    ok(res, r);
  }),
);
communicationRouter.post(
  "/notices/:id/publish",
  authorize("communication", "APPROVE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await publishNotice(req.params.id, req.user!.id);
    await writeAudit(req, {
      action: "NOTICE_PUBLISHED",
      entity: "notices",
      entityId: r.id,
    });
    ok(res, r);
  }),
);
communicationRouter.post(
  "/notices/:id/archive",
  authorize("communication", "APPROVE"),
  validate(idParam, "params"),
  validate(archiveSchema),
  h(async (req, res) => {
    const r = await archiveNotice(req.params.id, req.body.reason);
    await writeAudit(req, {
      action: "NOTICE_ARCHIVED",
      entity: "notices",
      entityId: r.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, r);
  }),
);
communicationRouter.delete(
  "/notices/:id",
  authorize("communication", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await removeNotice(req.params.id);
    await writeAudit(req, {
      action: "NOTICE_DELETED",
      entity: "notices",
      entityId: r.id,
    });
    ok(res, r);
  }),
);

// =========================== Everyone: my notices (/notices) ===========================
// No permission module: what a person sees is decided by who they are (staff, parent, student, their classes).
export const noticesRouter = Router();
noticesRouter.get(
  "/mine",
  validate(inboxListSchema, "query"),
  h(async (req, res) =>
    ok(res, await inbox(req.user!.id, req.query as unknown as InboxQuery)),
  ),
);
noticesRouter.get(
  "/unread-count",
  h(async (req, res) => ok(res, await unreadCount(req.user!.id))),
);
noticesRouter.post(
  "/:id/read",
  validate(idParam, "params"),
  h(async (req, res) => ok(res, await markRead(req.user!.id, req.params.id))),
);

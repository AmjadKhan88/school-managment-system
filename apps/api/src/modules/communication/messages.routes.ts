import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import {
  batchListSchema,
  BatchListQuery,
  composeSchema,
  ComposeInput,
  logListSchema,
  LogListQuery,
  templateSchema,
  TemplateInput,
} from "./messages.schema";
import {
  channelStatus,
  createTemplate,
  listBatches,
  listLogs,
  listTemplates,
  markSent,
  preview,
  retryBatch,
  sendMessages,
  updateTemplate,
} from "./messages.service";

/** Mounted at /communication/messages */
export const messagesRouter = Router();

messagesRouter.get(
  "/status",
  authorize("communication", "VIEW"),
  h(async (_req, res) => ok(res, channelStatus())),
);

messagesRouter.get(
  "/templates",
  authorize("communication", "VIEW"),
  h(async (_req, res) => ok(res, await listTemplates())),
);
messagesRouter.post(
  "/templates",
  authorize("communication", "CREATE"),
  validate(templateSchema),
  h(async (req, res) => {
    const t = await createTemplate(req.body as TemplateInput);
    await writeAudit(req, {
      action: "MESSAGE_TEMPLATE_CREATED",
      entity: "message_templates",
      entityId: t.id,
      newValues: { name: t.name },
    });
    ok(res, t, 201);
  }),
);
messagesRouter.put(
  "/templates/:id",
  authorize("communication", "EDIT"),
  validate(idParam, "params"),
  validate(templateSchema),
  h(async (req, res) => {
    const t = await updateTemplate(req.params.id, req.body as TemplateInput);
    await writeAudit(req, {
      action: "MESSAGE_TEMPLATE_UPDATED",
      entity: "message_templates",
      entityId: t.id,
      newValues: { name: t.name, isActive: t.isActive },
    });
    ok(res, t);
  }),
);

messagesRouter.post(
  "/preview",
  authorize("communication", "CREATE"),
  validate(composeSchema),
  h(async (req, res) =>
    ok(res, await preview(req.user!.schoolId, req.body as ComposeInput)),
  ),
);
messagesRouter.post(
  "/send",
  authorize("communication", "CREATE"),
  validate(composeSchema),
  h(async (req, res) => {
    const input = req.body as ComposeInput;
    const r = await sendMessages(req.user!.schoolId, req.user!.id, input);
    await writeAudit(req, {
      action: "MESSAGES_SENT",
      entity: "message_batches",
      entityId: r.id,
      newValues: {
        batchNo: r.batchNo,
        channel: input.channel,
        audience: input.audience.type,
        total: r.total,
        skipped: r.skipped,
      },
    });
    ok(res, r, 201);
  }),
);

messagesRouter.get(
  "/batches",
  authorize("communication", "VIEW"),
  validate(batchListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listBatches(req.query as unknown as BatchListQuery)),
  ),
);
messagesRouter.get(
  "/batches/:id/logs",
  authorize("communication", "VIEW"),
  validate(idParam, "params"),
  validate(logListSchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await listLogs(req.params.id, req.query as unknown as LogListQuery),
    ),
  ),
);
messagesRouter.post(
  "/batches/:id/retry",
  authorize("communication", "CREATE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await retryBatch(req.params.id);
    await writeAudit(req, {
      action: "MESSAGES_RETRIED",
      entity: "message_batches",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r);
  }),
);
messagesRouter.post(
  "/logs/:id/mark-sent",
  authorize("communication", "CREATE"),
  validate(idParam, "params"),
  h(async (req, res) => ok(res, await markSent(req.params.id))),
);

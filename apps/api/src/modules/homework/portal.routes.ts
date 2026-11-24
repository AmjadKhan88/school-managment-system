import { Router } from "express";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { receiveFiles } from "./files";
import { portalQuerySchema, portalSubmitSchema } from "./homework.schema";
import {
  childrenOf,
  portalAttachment,
  portalDetail,
  portalList,
  portalSubmissionFile,
  portalSubmit,
} from "./homework.service";
import { sendStored } from "./homework.routes";

export const homeworkPortalRouter = Router();
const q = (req: { query: unknown }) =>
  (req.query as { studentId: string }).studentId;

homeworkPortalRouter.get(
  "/children",
  h(async (req, res) => ok(res, await childrenOf(req.user!.id))),
);
homeworkPortalRouter.get(
  "/list",
  validate(portalQuerySchema, "query"),
  h(async (req, res) => ok(res, await portalList(req.user!, q(req)))),
);

// Files: above /:id
homeworkPortalRouter.get(
  "/attachments/:id",
  validate(idParam, "params"),
  validate(portalQuerySchema, "query"),
  h(async (req, res) =>
    sendStored(res, await portalAttachment(req.user!, req.params.id, q(req))),
  ),
);
homeworkPortalRouter.get(
  "/files/:id",
  validate(idParam, "params"),
  validate(portalQuerySchema, "query"),
  h(async (req, res) =>
    sendStored(
      res,
      await portalSubmissionFile(req.user!, req.params.id, q(req)),
    ),
  ),
);

homeworkPortalRouter.get(
  "/:id",
  validate(idParam, "params"),
  validate(portalQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await portalDetail(req.user!, req.params.id, q(req))),
  ),
);

homeworkPortalRouter.post(
  "/:id/submit",
  validate(idParam, "params"),
  receiveFiles,
  validate(portalSubmitSchema),
  h(async (req, res) => {
    const r = await portalSubmit(
      req.user!,
      req.params.id,
      req.body.studentId,
      req.body.note,
      (req.files as Express.Multer.File[] | undefined) ?? [],
    );
    await writeAudit(req, {
      action: "HOMEWORK_SUBMITTED",
      entity: "homework_submissions",
      entityId: r.id,
      newValues: {
        homeworkId: req.params.id,
        studentId: req.body.studentId,
        late: r.late,
      },
    });
    ok(res, r, 201);
  }),
);

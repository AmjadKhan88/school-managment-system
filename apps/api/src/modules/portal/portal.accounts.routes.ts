import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import {
  accountsFor,
  createLogin,
  Kind,
  resetLogin,
  setLoginActive,
} from "./portal.accounts";
import {
  activeLoginSchema,
  createLoginSchema,
  kindParamSchema,
} from "./portal.schema";

/** Staff-side management of student and parent logins. Mounted at /portal-accounts. */
export const portalAccountsRouter = Router();

const entity = (k: Kind) => (k === "student" ? "students" : "guardians");
const kindOf = (req: { params: unknown }) => (req.params as { kind: Kind }).kind;

portalAccountsRouter.get(
  "/student/:id",
  authorize("users", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => ok(res, await accountsFor(req.params.id))),
);

// The temporary password is returned once and is never stored in plain text.
portalAccountsRouter.post(
  "/:kind/:id",
  authorize("users", "CREATE"),
  validate(kindParamSchema, "params"),
  validate(createLoginSchema),
  h(async (req, res) => {
    const kind = kindOf(req);
    const r = await createLogin(
      kind,
      req.params.id,
      req.body.email,
      req.user!.schoolId,
    );
    await writeAudit(req, {
      action: "PORTAL_LOGIN_CREATED",
      entity: entity(kind),
      entityId: req.params.id,
      newValues: { email: r.email },
    });
    ok(res, r, 201);
  }),
);

portalAccountsRouter.post(
  "/:kind/:id/reset",
  authorize("users", "EDIT"),
  validate(kindParamSchema, "params"),
  h(async (req, res) => {
    const kind = kindOf(req);
    const r = await resetLogin(kind, req.params.id);
    await writeAudit(req, {
      action: "PORTAL_PASSWORD_RESET",
      entity: entity(kind),
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);

portalAccountsRouter.post(
  "/:kind/:id/active",
  authorize("users", "EDIT"),
  validate(kindParamSchema, "params"),
  validate(activeLoginSchema),
  h(async (req, res) => {
    const kind = kindOf(req);
    const r = await setLoginActive(kind, req.params.id, req.body.isActive);
    await writeAudit(req, {
      action: "PORTAL_LOGIN_ACTIVE",
      entity: entity(kind),
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r);
  }),
);

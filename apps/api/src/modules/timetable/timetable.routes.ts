import { Request, Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { scopeFor } from "../staff/scope";
import {
  classQuerySchema,
  configSchema,
  coverQuerySchema,
  entrySchema,
  EntryInput,
  optionsQuerySchema,
  periodSchema,
  PeriodInput,
  periodUpdateSchema,
  printQuerySchema,
  PrintQuery,
  roomSchema,
  sessionQuerySchema,
  teacherQuerySchema,
} from "./timetable.schema";
import {
  classGrid,
  coverNeeded,
  createDefaultPeriods,
  createPeriod,
  deleteEntry,
  deletePeriod,
  entryOptions,
  getSetup,
  printData,
  saveConfig,
  saveEntry,
  teacherGrid,
  teachersWithLoad,
  updatePeriod,
} from "./timetable.service";

export const timetableRouter = Router();

/** Leave information is shown only to people who manage the timetable or have staff permission. */
const canSeeLeave = (req: Request) =>
  req.user!.permissions.has("timetable:EDIT") ||
  req.user!.permissions.has("staff:VIEW");
const myEmployee = (req: Request) =>
  prisma.employee.findFirst({
    where: { userId: req.user!.id },
    select: { id: true },
  });

/** A scoped teacher may see only sections they teach or are class teacher of. */
async function guardSection(
  req: Request,
  sessionId: string,
  sectionId: string,
) {
  const scope = await scopeFor(req.user!, sessionId);
  if (
    scope &&
    !scope.classTeacher.some((c) => c.sectionId === sectionId) &&
    !scope.teaching.some((t) => t.sectionId === sectionId)
  ) {
    throw ApiError.forbidden(
      "You can see the timetable only of sections you teach",
    );
  }
}

// =========================== Setup ===========================
timetableRouter.get(
  "/setup",
  authorize("timetable", "VIEW"),
  validate(sessionQuerySchema, "query"),
  h(async (req, res) =>
    ok(res, await getSetup((req.query as { sessionId: string }).sessionId)),
  ),
);

timetableRouter.put(
  "/config",
  authorize("timetable", "EDIT"),
  validate(configSchema),
  h(async (req, res) => {
    const r = await saveConfig(req.body.sessionId, req.body.workingDays);
    await writeAudit(req, {
      action: "TIMETABLE_DAYS_SAVED",
      entity: "timetable_config",
      newValues: { sessionId: req.body.sessionId, ...r },
    });
    ok(res, r);
  }),
);

timetableRouter.post(
  "/periods/defaults",
  authorize("timetable", "CREATE"),
  validate(sessionQuerySchema),
  h(async (req, res) => {
    const r = await createDefaultPeriods(req.body.sessionId);
    await writeAudit(req, {
      action: "TIMETABLE_DEFAULT_PERIODS",
      entity: "timetable_periods",
      newValues: { sessionId: req.body.sessionId, ...r },
    });
    ok(res, r, 201);
  }),
);
timetableRouter.post(
  "/periods",
  authorize("timetable", "CREATE"),
  validate(periodSchema),
  h(async (req, res) => {
    const r = await createPeriod(req.body as PeriodInput);
    await writeAudit(req, {
      action: "TIMETABLE_PERIOD_CREATED",
      entity: "timetable_periods",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r, 201);
  }),
);
timetableRouter.put(
  "/periods/:id",
  authorize("timetable", "EDIT"),
  validate(idParam, "params"),
  validate(periodUpdateSchema),
  h(async (req, res) => {
    const r = await updatePeriod(req.params.id, req.body);
    await writeAudit(req, {
      action: "TIMETABLE_PERIOD_UPDATED",
      entity: "timetable_periods",
      entityId: req.params.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);
timetableRouter.delete(
  "/periods/:id",
  authorize("timetable", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await deletePeriod(req.params.id);
    await writeAudit(req, {
      action: "TIMETABLE_PERIOD_DELETED",
      entity: "timetable_periods",
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);

timetableRouter.get(
  "/rooms",
  authorize("timetable", "VIEW"),
  h(async (_req, res) =>
    ok(res, await prisma.room.findMany({ orderBy: { name: "asc" } })),
  ),
);
timetableRouter.post(
  "/rooms",
  authorize("timetable", "CREATE"),
  validate(roomSchema),
  h(async (req, res) => {
    const row = await prisma.room.create({ data: req.body });
    await writeAudit(req, {
      action: "ROOM_CREATED",
      entity: "rooms",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);
timetableRouter.put(
  "/rooms/:id",
  authorize("timetable", "EDIT"),
  validate(idParam, "params"),
  validate(roomSchema),
  h(async (req, res) => {
    const row = await prisma.room.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "ROOM_UPDATED",
      entity: "rooms",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);
timetableRouter.delete(
  "/rooms/:id",
  authorize("timetable", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.room.delete({ where: { id: req.params.id } }); // Restrict FK: refused once used in a timetable
    await writeAudit(req, {
      action: "ROOM_DELETED",
      entity: "rooms",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Grids ===========================
timetableRouter.get(
  "/class",
  authorize("timetable", "VIEW"),
  validate(classQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      sessionId: string;
      sectionId: string;
      weekOf?: Date;
    };
    await guardSection(req, q.sessionId, q.sectionId);
    ok(
      res,
      await classGrid(q.sessionId, q.sectionId, q.weekOf, canSeeLeave(req)),
    );
  }),
);

timetableRouter.get(
  "/teachers",
  authorize("timetable", "VIEW"),
  validate(sessionQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await teachersWithLoad((req.query as { sessionId: string }).sessionId),
    ),
  ),
);

timetableRouter.get(
  "/teacher",
  authorize("timetable", "VIEW"),
  validate(teacherQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      sessionId: string;
      employeeId?: string;
      weekOf?: Date;
    };
    let employeeId = q.employeeId;
    if (await scopeFor(req.user!, q.sessionId)) {
      // a scoped teacher sees only their own timetable
      const me = await myEmployee(req);
      if (!me)
        throw ApiError.forbidden(
          "Your login is not linked to an employee record",
        );
      if (employeeId && employeeId !== me.id)
        throw ApiError.forbidden("You can see only your own timetable");
      employeeId = me.id;
    }
    if (!employeeId) throw ApiError.badRequest("Choose a teacher");
    ok(
      res,
      await teacherGrid(q.sessionId, employeeId, q.weekOf, canSeeLeave(req)),
    );
  }),
);

timetableRouter.get(
  "/cover",
  authorize("timetable", "VIEW"),
  validate(coverQuerySchema, "query"),
  h(async (req, res) => {
    if (!canSeeLeave(req)) throw ApiError.forbidden();
    const q = req.query as unknown as {
      sessionId: string;
      from: Date;
      to: Date;
    };
    ok(res, await coverNeeded(q.sessionId, q.from, q.to));
  }),
);

// =========================== Entries ===========================
timetableRouter.get(
  "/options",
  authorize("timetable", "CREATE"),
  validate(optionsQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as { sessionId: string; sectionId: string };
    ok(res, await entryOptions(q.sessionId, q.sectionId));
  }),
);

// Filling an empty slot needs Create. Replacing a filled one needs Edit as well.
timetableRouter.put(
  "/entry",
  authorize("timetable", "CREATE"),
  validate(entrySchema),
  h(async (req, res) => {
    const b = req.body as EntryInput;
    const r = await saveEntry(b, req.user!.permissions.has("timetable:EDIT"));
    await writeAudit(req, {
      action: r.replaced ? "TIMETABLE_ENTRY_CHANGED" : "TIMETABLE_ENTRY_ADDED",
      entity: "timetable_entries",
      entityId: r.id,
      newValues: b,
    });
    ok(res, r);
  }),
);

timetableRouter.delete(
  "/entry/:id",
  authorize("timetable", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await deleteEntry(req.params.id);
    await writeAudit(req, {
      action: "TIMETABLE_ENTRY_CLEARED",
      entity: "timetable_entries",
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);

// =========================== Printing ===========================
timetableRouter.get(
  "/print",
  authorize("timetable", "PRINT"),
  validate(printQuerySchema, "query"),
  h(async (req, res) => {
    const q = { ...(req.query as unknown as PrintQuery) };
    if (await scopeFor(req.user!, q.sessionId)) {
      if (q.type === "class") {
        if (!q.sectionId)
          throw ApiError.forbidden("Choose one of your sections");
        await guardSection(req, q.sessionId, q.sectionId);
      } else {
        const me = await myEmployee(req);
        if (!me)
          throw ApiError.forbidden(
            "Your login is not linked to an employee record",
          );
        q.employeeId = me.id;
      }
    }
    ok(res, await printData(req.user!.schoolId, q));
  }),
);

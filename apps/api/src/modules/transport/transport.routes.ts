import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { searchBorrowers } from "../library/library.service";
import { buildTransportReport } from "./transport.reports";
import {
  assignmentListSchema,
  AssignmentListQuery,
  assignSchema,
  AssignInput,
  attendanceQuerySchema,
  AttendanceQuery,
  attendanceSaveSchema,
  AttendanceSave,
  driverSchema,
  DriverInput,
  endSchema,
  EndInput,
  maintenanceSchema,
  MaintenanceInput,
  moveSchema,
  MoveInput,
  reportParamSchema,
  reportQuerySchema,
  ReportQuery,
  TransportReportType,
  routeSchema,
  RouteInput,
  stopFeeSchema,
  stopListSchema,
  stopSchema,
  StopInput,
  studentSearchSchema,
  vehicleSchema,
  VehicleInput,
} from "./transport.schema";
import {
  addMaintenance,
  assignStudent,
  createDriver,
  createRoute,
  createStop,
  createVehicle,
  endAssignment,
  listAssignments,
  listDrivers,
  listMaintenance,
  listRoutes,
  listStops,
  listVehicles,
  moveStudent,
  roster,
  saveAttendance,
  setStopFee,
  updateDriver,
  updateRoute,
  updateStop,
  updateVehicle,
} from "./transport.service";

export const transportRouter = Router();

// =========================== Vehicles ===========================
transportRouter.get(
  "/vehicles",
  authorize("transport", "VIEW"),
  h(async (_req, res) => ok(res, await listVehicles())),
);
transportRouter.post(
  "/vehicles",
  authorize("transport", "CREATE"),
  validate(vehicleSchema),
  h(async (req, res) => {
    const r = await createVehicle(req.body as VehicleInput);
    await writeAudit(req, {
      action: "VEHICLE_CREATED",
      entity: "vehicles",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r, 201);
  }),
);
transportRouter.put(
  "/vehicles/:id",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(vehicleSchema),
  h(async (req, res) => {
    const r = await updateVehicle(req.params.id, req.body as VehicleInput);
    await writeAudit(req, {
      action: "VEHICLE_UPDATED",
      entity: "vehicles",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);
transportRouter.get(
  "/vehicles/:id/maintenance",
  authorize("transport", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => ok(res, await listMaintenance(req.params.id))),
);
transportRouter.post(
  "/vehicles/:id/maintenance",
  authorize("transport", "CREATE"),
  validate(idParam, "params"),
  validate(maintenanceSchema),
  h(async (req, res) => {
    const r = await addMaintenance(
      req.params.id,
      req.body as MaintenanceInput,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "VEHICLE_MAINTENANCE_ADDED",
      entity: "vehicles",
      entityId: req.params.id,
      newValues: { description: req.body.description, cost: req.body.cost },
    });
    ok(res, r, 201);
  }),
);

// =========================== Drivers ===========================
transportRouter.get(
  "/drivers",
  authorize("transport", "VIEW"),
  h(async (_req, res) => ok(res, await listDrivers())),
);
transportRouter.post(
  "/drivers",
  authorize("transport", "CREATE"),
  validate(driverSchema),
  h(async (req, res) => {
    const r = await createDriver(req.body as DriverInput);
    await writeAudit(req, {
      action: "DRIVER_CREATED",
      entity: "drivers",
      entityId: r.id,
      newValues: { fullName: req.body.fullName },
    });
    ok(res, r, 201);
  }),
);
transportRouter.put(
  "/drivers/:id",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(driverSchema),
  h(async (req, res) => {
    const r = await updateDriver(req.params.id, req.body as DriverInput);
    await writeAudit(req, {
      action: "DRIVER_UPDATED",
      entity: "drivers",
      entityId: r.id,
      newValues: { fullName: req.body.fullName, isActive: req.body.isActive },
    });
    ok(res, r);
  }),
);

// =========================== Routes and stops ===========================
transportRouter.get(
  "/routes",
  authorize("transport", "VIEW"),
  h(async (_req, res) => ok(res, await listRoutes())),
);
transportRouter.post(
  "/routes",
  authorize("transport", "CREATE"),
  validate(routeSchema),
  h(async (req, res) => {
    const r = await createRoute(req.body as RouteInput);
    await writeAudit(req, {
      action: "ROUTE_CREATED",
      entity: "transport_routes",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r, 201);
  }),
);
transportRouter.put(
  "/routes/:id",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(routeSchema),
  h(async (req, res) => {
    const r = await updateRoute(req.params.id, req.body as RouteInput);
    await writeAudit(req, {
      action: "ROUTE_UPDATED",
      entity: "transport_routes",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);

transportRouter.get(
  "/stops",
  authorize("transport", "VIEW"),
  validate(stopListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listStops((req.query as { routeId?: string }).routeId)),
  ),
);
transportRouter.post(
  "/stops",
  authorize("transport", "CREATE"),
  validate(stopSchema),
  h(async (req, res) => {
    const r = await createStop(req.body as StopInput);
    await writeAudit(req, {
      action: "STOP_CREATED",
      entity: "route_stops",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r, 201);
  }),
);
transportRouter.put(
  "/stops/:id",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(stopSchema),
  h(async (req, res) => {
    const r = await updateStop(req.params.id, req.body as StopInput);
    await writeAudit(req, {
      action: "STOP_UPDATED",
      entity: "route_stops",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);
transportRouter.put(
  "/stops/:id/fee",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(stopFeeSchema),
  h(async (req, res) => {
    const r = await setStopFee(
      req.params.id,
      req.body.monthlyFee,
      req.body.applyToStudents,
    );
    await writeAudit(req, {
      action: "STOP_FEE_CHANGED",
      entity: "route_stops",
      entityId: r.id,
      newValues: {
        monthlyFee: req.body.monthlyFee,
        updatedStudents: r.updatedStudents,
      },
    });
    ok(res, r);
  }),
);

// =========================== Assignments ===========================
transportRouter.get(
  "/student-search",
  authorize("transport", "VIEW"),
  validate(studentSearchSchema, "query"),
  h(async (req, res) =>
    ok(res, await searchBorrowers("STUDENT", (req.query as { q: string }).q)),
  ),
);
transportRouter.get(
  "/assignments",
  authorize("transport", "VIEW"),
  validate(assignmentListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listAssignments(req.query as unknown as AssignmentListQuery)),
  ),
);
transportRouter.post(
  "/assignments",
  authorize("transport", "CREATE"),
  validate(assignSchema),
  h(async (req, res) => {
    const r = await assignStudent(req.user!.id, req.body as AssignInput);
    await writeAudit(req, {
      action: "TRANSPORT_ASSIGNED",
      entity: "transport_assignments",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r, 201);
  }),
);
transportRouter.post(
  "/assignments/:id/move",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(moveSchema),
  h(async (req, res) => {
    const r = await moveStudent(
      req.user!.id,
      req.params.id,
      req.body as MoveInput,
    );
    await writeAudit(req, {
      action: "TRANSPORT_MOVED",
      entity: "transport_assignments",
      entityId: req.params.id,
      newValues: { newAssignmentId: r.id, ...req.body },
    });
    ok(res, r, 201);
  }),
);
transportRouter.post(
  "/assignments/:id/end",
  authorize("transport", "EDIT"),
  validate(idParam, "params"),
  validate(endSchema),
  h(async (req, res) => {
    const r = await endAssignment(req.params.id, req.body as EndInput);
    await writeAudit(req, {
      action: "TRANSPORT_ENDED",
      entity: "transport_assignments",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);

// =========================== Boarding attendance ===========================
transportRouter.get(
  "/attendance",
  authorize("transport", "VIEW"),
  validate(attendanceQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as AttendanceQuery;
    ok(res, await roster(q.routeId, q.date, q.trip));
  }),
);
transportRouter.post(
  "/attendance",
  authorize("transport", "CREATE"),
  validate(attendanceSaveSchema),
  h(async (req, res) => {
    const b = req.body as AttendanceSave;
    const r = await saveAttendance(req.user!.id, b);
    await writeAudit(req, {
      action: "TRANSPORT_ATTENDANCE_SAVED",
      entity: "transport_attendance",
      entityId: b.routeId,
      newValues: { date: b.date, trip: b.trip, saved: r.saved },
    });
    ok(res, r);
  }),
);

// =========================== Reports ===========================
transportRouter.get(
  "/reports/:type",
  authorize("transport", "VIEW"),
  validate(reportParamSchema, "params"),
  validate(reportQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await buildTransportReport(
        req.params.type as TransportReportType,
        req.query as unknown as ReportQuery,
      ),
    ),
  ),
);
transportRouter.get(
  "/reports/:type/export",
  authorize("transport", "EXPORT"),
  validate(reportParamSchema, "params"),
  validate(reportQuerySchema, "query"),
  h(async (req, res) => {
    const type = req.params.type as TransportReportType;
    const r = await buildTransportReport(
      type,
      req.query as unknown as ReportQuery,
    );
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: `transport_${type}`,
      newValues: { rows: r.rows.length },
    });
    await sendXlsx(
      res,
      `transport-${type}-${new Date().toISOString().slice(0, 10)}`,
      r.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
      r.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 12,
        money: c.kind === "money",
      })),
      r.rows,
    );
  }),
);

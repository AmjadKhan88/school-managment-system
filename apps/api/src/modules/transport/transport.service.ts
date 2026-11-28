import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { addDays, expiryState, isoDay } from "./transport.calc";
import type {
  AssignInput,
  AssignmentListQuery,
  AttendanceQuery,
  AttendanceSave,
  DriverInput,
  EndInput,
  MaintenanceInput,
  MoveInput,
  RouteInput,
  StopInput,
  VehicleInput,
} from "./transport.schema";

const OPTS = { timeout: 30_000, maxWait: 10_000 };
const todayUtc = () => new Date(isoDay(new Date()));
const f2 = (d: Prisma.Decimal) => d.toFixed(2);
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---------------- Vehicles ----------------
export async function listVehicles() {
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { vehicleNo: "asc" },
    include: { routes: { select: { id: true, name: true } } },
  });
  const counts = await prisma.transportAssignment.groupBy({
    by: ["routeId"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });
  const used = (routeIds: string[]) =>
    counts
      .filter((c) => routeIds.includes(c.routeId))
      .reduce((t, c) => t + c._count._all, 0);
  const today = todayUtc();
  return vehicles.map((v) => ({
    id: v.id,
    vehicleNo: v.vehicleNo,
    make: v.make,
    model: v.model,
    year: v.year,
    capacity: v.capacity,
    status: v.status,
    notes: v.notes,
    registrationExpiry: v.registrationExpiry,
    insuranceExpiry: v.insuranceExpiry,
    registrationState: expiryState(v.registrationExpiry, today),
    insuranceState: expiryState(v.insuranceExpiry, today),
    routes: v.routes.map((r) => r.name),
    assigned: used(v.routes.map((r) => r.id)),
  }));
}
export async function createVehicle(input: VehicleInput) {
  try {
    return await prisma.vehicle.create({ data: input, select: { id: true } });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("A vehicle with this number already exists");
    throw e;
  }
}
export async function updateVehicle(id: string, input: VehicleInput) {
  const v = await prisma.vehicle.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!v) throw ApiError.notFound("Vehicle not found");
  const busiest = await prisma.transportAssignment.groupBy({
    by: ["routeId"],
    where: { status: "ACTIVE", route: { vehicleId: id } },
    _count: { _all: true },
  });
  const most = Math.max(0, ...busiest.map((b) => b._count._all));
  if (input.capacity < most)
    throw ApiError.conflict(
      `A route on this vehicle already carries ${most} students. Capacity cannot be lower.`,
    );
  try {
    await prisma.vehicle.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("A vehicle with this number already exists");
    throw e;
  }
  return { id };
}
export async function listMaintenance(vehicleId: string) {
  const rows = await prisma.vehicleMaintenance.findMany({
    where: { vehicleId },
    orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return rows.map((m) => ({
    id: m.id,
    serviceDate: m.serviceDate,
    description: m.description,
    cost: m.cost ? f2(m.cost) : null,
    workshop: m.workshop,
    nextDueDate: m.nextDueDate,
    odometer: m.odometer,
  }));
}
export async function addMaintenance(
  vehicleId: string,
  input: MaintenanceInput,
  userId: string,
) {
  if (
    !(await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    }))
  )
    throw ApiError.notFound("Vehicle not found");
  return prisma.vehicleMaintenance.create({
    data: { ...input, vehicleId, createdById: userId },
    select: { id: true },
  });
}

// ---------------- Drivers ----------------
export async function listDrivers() {
  const rows = await prisma.driver.findMany({
    orderBy: { fullName: "asc" },
    include: { routes: { select: { name: true } } },
  });
  const today = todayUtc();
  return rows.map((d) => ({
    id: d.id,
    fullName: d.fullName,
    phone: d.phone,
    cnic: d.cnic,
    licenseNo: d.licenseNo,
    licenseExpiry: d.licenseExpiry,
    licenseState: expiryState(d.licenseExpiry, today),
    address: d.address,
    isActive: d.isActive,
    routes: d.routes.map((r) => r.name),
  }));
}
export async function createDriver(input: DriverInput) {
  try {
    return await prisma.driver.create({
      data: { ...input, isActive: input.isActive ?? true },
      select: { id: true },
    });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict(
        "A driver with this CNIC or licence number already exists",
      );
    throw e;
  }
}
export async function updateDriver(id: string, input: DriverInput) {
  try {
    await prisma.driver.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict(
        "A driver with this CNIC or licence number already exists",
      );
    throw e;
  }
  return { id };
}

// ---------------- Routes and stops ----------------
async function checkRefs(vehicleId?: string | null, driverId?: string | null) {
  if (
    vehicleId &&
    !(await prisma.vehicle.findFirst({
      where: { id: vehicleId, status: { not: "RETIRED" } },
      select: { id: true },
    }))
  )
    throw ApiError.badRequest("Choose a vehicle that is in service");
  if (
    driverId &&
    !(await prisma.driver.findFirst({
      where: { id: driverId, isActive: true },
      select: { id: true },
    }))
  )
    throw ApiError.badRequest("Choose an active driver");
}

export async function listRoutes() {
  const [rows, counts] = [
    await prisma.transportRoute.findMany({
      orderBy: { name: "asc" },
      include: {
        vehicle: { select: { id: true, vehicleNo: true, capacity: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        _count: { select: { stops: true } },
      },
    }),
    await prisma.transportAssignment.groupBy({
      by: ["routeId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    vehicle: r.vehicle,
    driver: r.driver,
    morningTime: r.morningTime,
    afternoonTime: r.afternoonTime,
    notes: r.notes,
    isActive: r.isActive,
    stops: r._count.stops,
    students: counts.find((c) => c.routeId === r.id)?._count._all ?? 0,
  }));
}
export async function createRoute(input: RouteInput) {
  await checkRefs(input.vehicleId, input.driverId);
  try {
    return await prisma.transportRoute.create({
      data: { ...input, isActive: input.isActive ?? true },
      select: { id: true },
    });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("A route with this name already exists");
    throw e;
  }
}
export async function updateRoute(id: string, input: RouteInput) {
  const cur = await prisma.transportRoute.findUnique({
    where: { id },
    select: { vehicleId: true, driverId: true },
  });
  if (!cur) throw ApiError.notFound("Route not found");
  await checkRefs(
    input.vehicleId !== cur.vehicleId ? input.vehicleId : null,
    input.driverId !== cur.driverId ? input.driverId : null,
  );
  if (input.vehicleId) {
    const [v, n] = await Promise.all([
      prisma.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { capacity: true, vehicleNo: true },
      }),
      prisma.transportAssignment.count({
        where: { routeId: id, status: "ACTIVE" },
      }),
    ]);
    if (v && n > v.capacity)
      throw ApiError.conflict(
        `This route carries ${n} students but ${v.vehicleNo} has only ${v.capacity} seats`,
      );
  }
  if (
    input.isActive === false &&
    (await prisma.transportAssignment.count({
      where: { routeId: id, status: "ACTIVE" },
    })) > 0
  )
    throw ApiError.conflict(
      "Students are still assigned to this route. Move or end their assignments first.",
    );
  try {
    await prisma.transportRoute.update({ where: { id }, data: input });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("A route with this name already exists");
    throw e;
  }
  return { id };
}

export async function listStops(routeId?: string) {
  const rows = await prisma.routeStop.findMany({
    where: routeId ? { routeId } : {},
    orderBy: [{ route: { name: "asc" } }, { sortOrder: "asc" }],
    include: {
      route: { select: { name: true } },
      _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    routeId: s.routeId,
    routeName: s.route.name,
    name: s.name,
    sortOrder: s.sortOrder,
    pickupTime: s.pickupTime,
    monthlyFee: f2(s.monthlyFee),
    isActive: s.isActive,
    students: s._count.assignments,
  }));
}
export async function createStop(input: StopInput) {
  if (
    !(await prisma.transportRoute.findUnique({
      where: { id: input.routeId },
      select: { id: true },
    }))
  )
    throw ApiError.badRequest("Choose a route");
  const order =
    input.sortOrder ??
    ((
      await prisma.routeStop.aggregate({
        where: { routeId: input.routeId },
        _max: { sortOrder: true },
      })
    )._max.sortOrder ?? 0) + 1;
  try {
    return await prisma.routeStop.create({
      data: { ...input, sortOrder: order, isActive: input.isActive ?? true },
      select: { id: true },
    });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("This route already has a stop with that name");
    throw e;
  }
}
export async function updateStop(id: string, input: StopInput) {
  const s = await prisma.routeStop.findUnique({
    where: { id },
    select: { routeId: true, sortOrder: true },
  });
  if (!s) throw ApiError.notFound("Stop not found");
  if (
    input.isActive === false &&
    (await prisma.transportAssignment.count({
      where: { stopId: id, status: "ACTIVE" },
    })) > 0
  )
    throw ApiError.conflict("Students are still assigned to this stop");
  const { routeId: _ignored, ...data } = input; // a stop never changes route
  try {
    await prisma.routeStop.update({
      where: { id },
      data: { ...data, sortOrder: input.sortOrder ?? s.sortOrder },
    });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("This route already has a stop with that name");
    throw e;
  }
  return { id };
}
/** Sets a stop's fee. Optionally moves every student still on the old fee to the new one. Customised fees are left alone. */
export async function setStopFee(
  id: string,
  monthlyFee: number,
  applyToStudents: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const s = await tx.routeStop.findUnique({
      where: { id },
      select: { monthlyFee: true },
    });
    if (!s) throw ApiError.notFound("Stop not found");
    await tx.routeStop.update({ where: { id }, data: { monthlyFee } });
    const moved = applyToStudents
      ? await tx.transportAssignment.updateMany({
          where: { stopId: id, status: "ACTIVE", monthlyFee: s.monthlyFee },
          data: { monthlyFee },
        })
      : { count: 0 };
    return { id, updatedStudents: moved.count };
  }, OPTS);
}

// ---------------- Assignments ----------------
const assignInclude = {
  student: {
    select: {
      id: true,
      fullName: true,
      admissionNo: true,
      enrollments: {
        orderBy: { session: { startDate: "desc" } },
        take: 1,
        select: {
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  },
  route: { select: { id: true, name: true } },
  stop: { select: { id: true, name: true } },
} satisfies Prisma.TransportAssignmentInclude;
type AssignRow = Prisma.TransportAssignmentGetPayload<{
  include: typeof assignInclude;
}>;
const assignShape = (a: AssignRow) => ({
  id: a.id,
  status: a.status,
  student: {
    id: a.student.id,
    name: a.student.fullName,
    admissionNo: a.student.admissionNo,
  },
  className: a.student.enrollments[0]
    ? `${a.student.enrollments[0].class.name} ${a.student.enrollments[0].section.name}`
    : null,
  route: a.route,
  stop: a.stop,
  monthlyFee: f2(a.monthlyFee),
  feeNote: a.feeNote,
  startDate: a.startDate,
  endDate: a.endDate,
  endReason: a.endReason,
});

export async function listAssignments(q: AssignmentListQuery) {
  const where: Prisma.TransportAssignmentWhereInput = {
    ...(q.routeId && { routeId: q.routeId }),
    ...(q.status && { status: q.status }),
    ...(q.q && {
      student: {
        OR: [
          { fullName: { contains: q.q, mode: "insensitive" } },
          { admissionNo: { contains: q.q, mode: "insensitive" } },
        ],
      },
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.transportAssignment.findMany({
      where,
      include: assignInclude,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.transportAssignment.count({ where }),
  ]);
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map(assignShape),
  };
}

async function seatCheck(routeId: string) {
  const route = await prisma.transportRoute.findUnique({
    where: { id: routeId },
    select: {
      isActive: true,
      name: true,
      vehicle: { select: { vehicleNo: true, capacity: true, status: true } },
    },
  });
  if (!route || !route.isActive)
    throw ApiError.badRequest("Choose a route that is in use");
  if (route.vehicle) {
    if (route.vehicle.status === "RETIRED")
      throw ApiError.conflict(
        `${route.vehicle.vehicleNo} is retired. Give the route another vehicle first.`,
      );
    const used = await prisma.transportAssignment.count({
      where: { routeId, status: "ACTIVE" },
    });
    if (used >= route.vehicle.capacity)
      throw ApiError.conflict(
        `${route.vehicle.vehicleNo} is full (${route.vehicle.capacity} seats)`,
      );
  }
}

export async function assignStudent(userId: string, input: AssignInput) {
  const [student, stop] = await Promise.all([
    prisma.student.findFirst({
      where: { id: input.studentId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    }),
    prisma.routeStop.findFirst({
      where: { id: input.stopId, isActive: true },
      select: { id: true, routeId: true, monthlyFee: true },
    }),
  ]);
  if (!student) throw ApiError.badRequest("Choose an active student");
  if (!stop) throw ApiError.badRequest("Choose a stop that is in use");
  await seatCheck(stop.routeId);
  try {
    return await prisma.$transaction(async (tx) => {
      const a = await tx.transportAssignment.create({
        data: {
          studentId: student.id,
          routeId: stop.routeId,
          stopId: stop.id,
          monthlyFee: input.monthlyFee ?? stop.monthlyFee,
          feeNote: input.feeNote,
          startDate: input.startDate ?? todayUtc(),
          activeLock: student.id,
          createdById: userId,
        },
        select: { id: true },
      });
      await tx.student.update({
        where: { id: student.id },
        data: { needsTransport: true },
      });
      return a;
    }, OPTS);
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict(
        "This student already has a transport assignment. Move or end it first.",
      );
    throw e;
  }
}

/** Ends the current assignment the day before the new one starts and creates the new one, together. */
export async function moveStudent(
  userId: string,
  id: string,
  input: MoveInput,
) {
  const old = await prisma.transportAssignment.findUnique({ where: { id } });
  if (!old || old.status !== "ACTIVE")
    throw ApiError.conflict("Only a current assignment can be moved");
  const stop = await prisma.routeStop.findFirst({
    where: { id: input.stopId, isActive: true },
    select: {
      id: true,
      routeId: true,
      monthlyFee: true,
      route: { select: { name: true } },
    },
  });
  if (!stop) throw ApiError.badRequest("Choose a stop that is in use");
  const start = input.startDate ?? todayUtc();
  if (start.getTime() <= old.startDate.getTime())
    throw ApiError.badRequest(
      "The new start date must be after the current assignment began. To correct a mistake, end it and assign again.",
    );
  if (stop.routeId !== old.routeId) await seatCheck(stop.routeId);
  return prisma.$transaction(async (tx) => {
    await tx.transportAssignment.update({
      where: { id },
      data: {
        status: "ENDED",
        endDate: addDays(start, -1),
        endReason: `Moved to ${stop.route.name}`,
        activeLock: null,
      },
    });
    return tx.transportAssignment.create({
      data: {
        studentId: old.studentId,
        routeId: stop.routeId,
        stopId: stop.id,
        monthlyFee: input.monthlyFee ?? stop.monthlyFee,
        feeNote: input.feeNote,
        startDate: start,
        activeLock: old.studentId,
        createdById: userId,
      },
      select: { id: true },
    });
  }, OPTS);
}

export async function endAssignment(id: string, input: EndInput) {
  const a = await prisma.transportAssignment.findUnique({
    where: { id },
    select: { startDate: true, studentId: true, status: true },
  });
  if (!a) throw ApiError.notFound("Assignment not found");
  const endDate = input.endDate ?? todayUtc();
  if (endDate.getTime() < a.startDate.getTime())
    throw ApiError.badRequest("The end date is before the start date");
  const r = await prisma.transportAssignment.updateMany({
    where: { id, status: "ACTIVE" },
    data: {
      status: "ENDED",
      endDate,
      endReason: input.reason,
      activeLock: null,
    },
  });
  if (r.count === 0)
    throw ApiError.conflict("This assignment has already ended");
  await prisma.student.update({
    where: { id: a.studentId },
    data: { needsTransport: false },
  });
  return { id };
}

// ---------------- Boarding attendance ----------------
export async function roster(
  routeId: string,
  date: Date,
  trip: AttendanceQuery["trip"],
) {
  const route = await prisma.transportRoute.findUnique({
    where: { id: routeId },
    select: { name: true },
  });
  if (!route) throw ApiError.notFound("Route not found");
  const rows = await prisma.transportAssignment.findMany({
    where: {
      routeId,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
      student: { status: "ACTIVE", archivedAt: null },
    },
    include: {
      student: { select: { id: true, fullName: true, admissionNo: true } },
      stop: { select: { name: true, sortOrder: true, pickupTime: true } },
    },
  });
  const marks = await prisma.transportAttendance.findMany({
    where: { date, trip, studentId: { in: rows.map((r) => r.studentId) } },
    select: { studentId: true, status: true },
  });
  const by = new Map(marks.map((m) => [m.studentId, m.status]));
  return {
    route: route.name,
    recorded: marks.length > 0,
    students: rows
      .sort(
        (a, b) =>
          a.stop.sortOrder - b.stop.sortOrder ||
          a.student.fullName.localeCompare(b.student.fullName),
      )
      .map((r) => ({
        studentId: r.studentId,
        name: r.student.fullName,
        admissionNo: r.student.admissionNo,
        stop: r.stop.name,
        pickupTime: r.stop.pickupTime,
        status: by.get(r.studentId) ?? null,
      })),
  };
}

export async function saveAttendance(userId: string, input: AttendanceSave) {
  const r = await roster(input.routeId, input.date, input.trip);
  const allowed = new Set(r.students.map((s) => s.studentId));
  if (input.records.some((x) => !allowed.has(x.studentId)))
    throw ApiError.badRequest(
      "A student in the list is not on this route on that date",
    );
  await prisma.$transaction(
    input.records.map((x) =>
      prisma.transportAttendance.upsert({
        where: {
          date_trip_studentId: {
            date: input.date,
            trip: input.trip,
            studentId: x.studentId,
          },
        },
        create: {
          routeId: input.routeId,
          date: input.date,
          trip: input.trip,
          studentId: x.studentId,
          status: x.status,
          markedById: userId,
        },
        update: {
          routeId: input.routeId,
          status: x.status,
          markedById: userId,
        },
      }),
    ),
  );
  return { saved: input.records.length };
}

// ---------------- Parent portal ----------------
export async function transportFor(studentId: string) {
  const a = await prisma.transportAssignment.findFirst({
    where: { studentId, status: "ACTIVE" },
    include: {
      route: {
        include: {
          vehicle: { select: { vehicleNo: true, make: true, model: true } },
          driver: { select: { fullName: true, phone: true } },
        },
      },
      stop: { select: { name: true, pickupTime: true } },
    },
  });
  if (!a) return null;
  const v = a.route.vehicle;
  return {
    route: a.route.name,
    stop: a.stop.name,
    pickupTime: a.stop.pickupTime,
    morningTime: a.route.morningTime,
    afternoonTime: a.route.afternoonTime,
    vehicle: v
      ? [v.vehicleNo, [v.make, v.model].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(" · ")
      : null,
    driverName: a.route.driver?.fullName ?? null,
    driverPhone: a.route.driver?.phone ?? null,
    monthlyFee: f2(a.monthlyFee),
    startDate: a.startDate,
  };
}

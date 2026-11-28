import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { expiryState, isoDay, seatsFree } from "./transport.calc";
import type { ReportQuery, TransportReportType } from "./transport.schema";

export interface TReport {
  title: string;
  note?: string;
  columns: { key: string; header: string; kind?: "money"; width?: number }[];
  rows: Record<string, string | number | null>[];
}
type Row = Record<string, string | number | null>;
const day = (d: Date | null) => (d ? isoDay(d) : "");
const todayUtc = () => new Date(isoDay(new Date()));
const money = (key: string, header: string) => ({
  key,
  header,
  kind: "money" as const,
  width: 14,
});
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const range = (q: ReportQuery) => {
  const to = q.to ?? todayUtc();
  return { from: q.from ?? new Date(to.getTime() - 29 * 86_400_000), to };
};
const STATE_TEXT = {
  EXPIRED: "Expired",
  SOON: "Due soon",
  OK: "Valid",
} as const;

async function roster(q: ReportQuery): Promise<TReport> {
  const rows = await prisma.transportAssignment.findMany({
    where: { status: "ACTIVE", ...(q.routeId && { routeId: q.routeId }) },
    take: 5000,
    include: {
      route: { select: { name: true } },
      stop: { select: { name: true, sortOrder: true, pickupTime: true } },
      student: {
        select: {
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
          guardians: {
            orderBy: { isPrimary: "desc" },
            take: 1,
            select: { guardian: { select: { fullName: true, phone: true } } },
          },
        },
      },
    },
  });
  rows.sort(
    (a, b) =>
      a.route.name.localeCompare(b.route.name) ||
      a.stop.sortOrder - b.stop.sortOrder ||
      a.student.fullName.localeCompare(b.student.fullName),
  );
  return {
    title: "Transport roster",
    columns: [
      { key: "route", header: "Route", width: 20 },
      { key: "stop", header: "Stop", width: 20 },
      { key: "pickup", header: "Pickup", width: 10 },
      { key: "student", header: "Student", width: 26 },
      { key: "adm", header: "Admission no", width: 16 },
      { key: "class", header: "Class", width: 14 },
      { key: "guardian", header: "Parent", width: 22 },
      { key: "phone", header: "Phone", width: 16 },
      money("fee", "Monthly fee"),
      { key: "since", header: "Since", width: 12 },
    ],
    rows: rows.map((a) => {
      const e = a.student.enrollments[0];
      const g = a.student.guardians[0]?.guardian;
      return {
        route: a.route.name,
        stop: a.stop.name,
        pickup: a.stop.pickupTime ?? "",
        student: a.student.fullName,
        adm: a.student.admissionNo,
        class: e ? `${e.class.name} ${e.section.name}` : "",
        guardian: g?.fullName ?? "",
        phone: g?.phone ?? "",
        fee: Number(a.monthlyFee.toFixed(2)),
        since: day(a.startDate),
      };
    }),
  };
}

async function utilization(): Promise<TReport> {
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { vehicleNo: "asc" },
    include: {
      routes: {
        select: {
          id: true,
          name: true,
          driver: { select: { fullName: true } },
        },
      },
    },
  });
  const counts = await prisma.transportAssignment.groupBy({
    by: ["routeId"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });
  const rows: Row[] = vehicles.map((v) => {
    const used = counts
      .filter((c) => v.routes.some((r) => r.id === c.routeId))
      .reduce((t, c) => t + c._count._all, 0);
    return {
      vehicle: v.vehicleNo,
      type: [v.make, v.model].filter(Boolean).join(" "),
      status: label(v.status),
      capacity: v.capacity,
      students: used,
      free: seatsFree(v.capacity, used),
      routes: v.routes.map((r) => r.name).join(", "),
      drivers: [
        ...new Set(v.routes.map((r) => r.driver?.fullName).filter(Boolean)),
      ].join(", "),
    };
  });
  return {
    title: "Vehicle utilisation",
    columns: [
      { key: "vehicle", header: "Vehicle", width: 14 },
      { key: "type", header: "Make and model", width: 22 },
      { key: "status", header: "Status", width: 12 },
      { key: "capacity", header: "Seats", width: 8 },
      { key: "students", header: "Students", width: 10 },
      { key: "free", header: "Free seats", width: 10 },
      { key: "routes", header: "Routes", width: 28 },
      { key: "drivers", header: "Drivers", width: 24 },
    ],
    rows,
    note: "Students are those currently assigned to the routes this vehicle serves.",
  };
}

async function fees(q: ReportQuery): Promise<TReport> {
  const routes = await prisma.transportRoute.findMany({
    where: q.routeId ? { id: q.routeId } : {},
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      _count: { select: { stops: true } },
    },
  });
  const sums = await prisma.transportAssignment.groupBy({
    by: ["routeId"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
    _sum: { monthlyFee: true },
  });
  const rows: Row[] = routes.map((r) => {
    const s = sums.find((x) => x.routeId === r.id);
    const total = s?._sum.monthlyFee ?? new Prisma.Decimal(0);
    const n = s?._count._all ?? 0;
    return {
      route: r.name,
      stops: r._count.stops,
      students: n,
      monthly: Number(total.toFixed(2)),
      average: n ? Number(total.div(n).toFixed(2)) : 0,
    };
  });
  if (rows.length)
    rows.push({
      route: "Total",
      stops: rows.reduce((t, r) => t + Number(r.stops), 0),
      students: rows.reduce((t, r) => t + Number(r.students), 0),
      monthly:
        Math.round(rows.reduce((t, r) => t + Number(r.monthly), 0) * 100) / 100,
      average: 0,
    });
  return {
    title: "Transport fees expected each month",
    columns: [
      { key: "route", header: "Route", width: 24 },
      { key: "stops", header: "Stops", width: 8 },
      { key: "students", header: "Students", width: 10 },
      money("monthly", "Monthly fees"),
      money("average", "Average per student"),
    ],
    rows,
    note: "What the current assignments add to each monthly invoice. Collected amounts are in the fee and finance reports under the Transport Fee category.",
  };
}

async function attendance(q: ReportQuery): Promise<TReport> {
  const { from, to } = range(q);
  const groups = await prisma.transportAttendance.groupBy({
    by: ["routeId", "trip", "status"],
    where: {
      date: { gte: from, lte: to },
      ...(q.routeId && { routeId: q.routeId }),
    },
    _count: { _all: true },
  });
  const routes = await prisma.transportRoute.findMany({
    where: { id: { in: [...new Set(groups.map((g) => g.routeId))] } },
    select: { id: true, name: true },
  });
  const keys = [...new Set(groups.map((g) => `${g.routeId}|${g.trip}`))];
  const rows: Row[] = keys
    .map((k) => {
      const [routeId, trip] = k.split("|");
      const n = (s: string) =>
        groups.find(
          (g) => g.routeId === routeId && g.trip === trip && g.status === s,
        )?._count._all ?? 0;
      const boarded = n("BOARDED"),
        absent = n("ABSENT"),
        total = boarded + absent;
      return {
        route: routes.find((r) => r.id === routeId)?.name ?? "",
        trip: label(trip),
        boarded,
        absent,
        total,
        rate: total ? Math.round((boarded / total) * 1000) / 10 : 0,
      };
    })
    .sort(
      (a, b) =>
        String(a.route).localeCompare(String(b.route)) ||
        String(a.trip).localeCompare(String(b.trip)),
    );
  return {
    title: `Transport attendance ${day(from)} to ${day(to)}`,
    columns: [
      { key: "route", header: "Route", width: 24 },
      { key: "trip", header: "Trip", width: 12 },
      { key: "boarded", header: "Boarded", width: 10 },
      { key: "absent", header: "Absent", width: 10 },
      { key: "total", header: "Records", width: 10 },
      { key: "rate", header: "Boarded %", width: 12 },
    ],
    rows,
  };
}

async function maintenance(q: ReportQuery): Promise<TReport> {
  const { from, to } = range(q);
  const list = await prisma.vehicleMaintenance.findMany({
    where: {
      serviceDate: { gte: from, lte: to },
      ...(q.vehicleId && { vehicleId: q.vehicleId }),
    },
    orderBy: { serviceDate: "asc" },
    include: { vehicle: { select: { vehicleNo: true } } },
    take: 5000,
  });
  const rows: Row[] = list.map((m) => ({
    date: day(m.serviceDate),
    vehicle: m.vehicle.vehicleNo,
    description: m.description,
    workshop: m.workshop ?? "",
    odometer: m.odometer,
    cost: m.cost ? Number(m.cost.toFixed(2)) : 0,
    next: day(m.nextDueDate),
  }));
  if (rows.length)
    rows.push({
      date: "Total",
      vehicle: "",
      description: "",
      workshop: "",
      odometer: null,
      cost:
        Math.round(rows.reduce((t, r) => t + Number(r.cost), 0) * 100) / 100,
      next: "",
    });
  return {
    title: `Vehicle maintenance ${day(from)} to ${day(to)}`,
    columns: [
      { key: "date", header: "Date", width: 12 },
      { key: "vehicle", header: "Vehicle", width: 14 },
      { key: "description", header: "Work done", width: 34 },
      { key: "workshop", header: "Workshop", width: 20 },
      { key: "odometer", header: "Odometer", width: 12 },
      money("cost", "Cost"),
      { key: "next", header: "Next due", width: 12 },
    ],
    rows,
  };
}

/** Registrations, insurance and driver licences that are expired or run out within 30 days. */
async function expiry(): Promise<TReport> {
  const today = todayUtc();
  const [vehicles, drivers] = [
    await prisma.vehicle.findMany({
      where: { status: { not: "RETIRED" } },
      select: {
        vehicleNo: true,
        registrationExpiry: true,
        insuranceExpiry: true,
      },
    }),
    await prisma.driver.findMany({
      where: { isActive: true },
      select: { fullName: true, licenseExpiry: true },
    }),
  ];
  const rows: Row[] = [];
  const add = (what: string, who: string, d: Date | null) => {
    const s = expiryState(d, today);
    if (s === "EXPIRED" || s === "SOON")
      rows.push({ what, who, date: day(d), state: STATE_TEXT[s] });
  };
  vehicles.forEach((v) => {
    add("Vehicle registration", v.vehicleNo, v.registrationExpiry);
    add("Vehicle insurance", v.vehicleNo, v.insuranceExpiry);
  });
  drivers.forEach((d) => add("Driver licence", d.fullName, d.licenseExpiry));
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    title: "Documents expired or expiring within 30 days",
    columns: [
      { key: "what", header: "Document", width: 22 },
      { key: "who", header: "Vehicle or driver", width: 26 },
      { key: "date", header: "Expires", width: 12 },
      { key: "state", header: "State", width: 12 },
    ],
    rows,
    note: rows.length ? undefined : "Nothing is expired or due soon.",
  };
}

export function buildTransportReport(
  type: TransportReportType,
  q: ReportQuery,
): Promise<TReport> {
  switch (type) {
    case "roster":
      return roster(q);
    case "utilization":
      return utilization();
    case "fees":
      return fees(q);
    case "attendance":
      return attendance(q);
    case "maintenance":
      return maintenance(q);
    case "expiry":
      return expiry();
  }
}

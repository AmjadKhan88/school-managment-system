import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  addStatus,
  attendancePercent,
  Counts,
  emptyCounts,
  LETTER,
  recorded,
  Status,
  withinEditWindow,
} from "../attendance/attendance.calc";
import type { Report } from "../attendance/reports.service";
import type {
  Group,
  SaveStaffRegister,
  StaffReportQuery,
  StaffReportType,
  StaffRegisterQuery,
} from "./staffattendance.schema";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(iso(new Date()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Employees on the register for a date: joined by then and not yet gone. Teachers or other staff. */
const eligible = (date: Date, group?: Group, departmentId?: string) =>
  prisma.employee.findMany({
    where: {
      joiningDate: { lte: date },
      OR: [{ leavingDate: null }, { leavingDate: { gte: date } }],
      ...(group && { isTeacher: group === "teachers" }),
      ...(departmentId && { departmentId }),
    },
    orderBy: { fullName: "asc" },
    include: {
      designation: { select: { name: true } },
      department: { select: { name: true } },
    },
  });

export async function loadStaffRegister(q: StaffRegisterQuery) {
  const employees = await eligible(q.date, q.group, q.departmentId);
  const ids = employees.map((e) => e.id);
  const [rows, leaves] = await Promise.all([
    prisma.staffAttendance.findMany({
      where: { date: q.date, employeeId: { in: ids } },
    }),
    prisma.leaveApplication.findMany({
      where: {
        applicantType: "EMPLOYEE",
        employeeId: { in: ids },
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { lte: q.date },
        endDate: { gte: q.date },
      },
      orderBy: { status: "asc" }, // APPROVED sorts before PENDING
      select: {
        employeeId: true,
        status: true,
        applicationNo: true,
        leaveType: true,
      },
    }),
  ]);
  const byEmployee = new Map(rows.map((r) => [r.employeeId, r]));
  const leaveOf = new Map<string, (typeof leaves)[number]>();
  leaves.forEach((l) => {
    if (!leaveOf.has(l.employeeId!)) leaveOf.set(l.employeeId!, l);
  });

  const users = await prisma.user.findMany({
    where: {
      id: {
        in: rows
          .flatMap((r) => [r.markedById, r.updatedById])
          .filter((x): x is string => !!x),
      },
    },
    select: { id: true, fullName: true },
  });
  const name = new Map(users.map((u) => [u.id, u.fullName]));

  return {
    date: iso(q.date),
    taken: rows.length > 0,
    employees: employees.map((e) => {
      const a = byEmployee.get(e.id);
      const l = leaveOf.get(e.id);
      return {
        employeeId: e.id,
        employeeNo: e.employeeNo,
        fullName: e.fullName,
        designation: e.designation.name,
        department: e.department?.name ?? null,
        status: a?.status ?? null,
        checkIn: a?.checkIn ?? null,
        checkOut: a?.checkOut ?? null,
        markedBy: a?.markedById ? (name.get(a.markedById) ?? null) : null,
        leave: l
          ? {
              applicationNo: l.applicationNo,
              type: l.leaveType,
              status: l.status,
            }
          : null,
      };
    }),
  };
}

interface Who {
  id: string;
  canEdit: boolean;
  canApprove: boolean;
}

export async function saveStaffRegister(input: SaveStaffRegister, who: Who) {
  if (!who.canApprove && !withinEditWindow(input.date, todayUtc())) {
    throw ApiError.forbidden(
      "Attendance older than 7 days can only be recorded or changed by an approver",
    );
  }
  const ids = input.entries.map((e) => e.employeeId);
  const onRegister = new Set(
    (await eligible(input.date, input.group)).map((e) => e.id),
  );
  if (ids.some((id) => !onRegister.has(id)))
    throw ApiError.badRequest(
      "Some employees are not on this register. Reload and try again.",
    );

  const existing = await prisma.staffAttendance.findMany({
    where: { date: input.date, employeeId: { in: ids } },
  });
  const byEmployee = new Map(existing.map((x) => [x.employeeId, x]));

  const creates: Prisma.StaffAttendanceCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.StaffAttendanceUpdateInput }[] = [];
  let unchanged = 0;

  for (const e of input.entries) {
    // Times only make sense for days the person attended.
    const attended =
      e.status === "PRESENT" || e.status === "LATE" || e.status === "HALF_DAY";
    const checkIn = attended ? (e.checkIn ?? null) : null;
    const checkOut = attended ? (e.checkOut ?? null) : null;
    const remarks = e.remarks ?? null;
    const ex = byEmployee.get(e.employeeId);
    if (!ex) {
      creates.push({
        employeeId: e.employeeId,
        date: input.date,
        status: e.status,
        checkIn,
        checkOut,
        remarks,
        markedById: who.id,
      });
    } else if (
      ex.status !== e.status ||
      ex.checkIn !== checkIn ||
      ex.checkOut !== checkOut ||
      (ex.remarks ?? null) !== remarks
    ) {
      updates.push({
        id: ex.id,
        data: {
          status: e.status,
          checkIn,
          checkOut,
          remarks,
          updatedById: who.id,
        },
      });
    } else unchanged++;
  }

  if (updates.length > 0 && !who.canEdit) {
    throw ApiError.forbidden(
      `Attendance for ${updates.length} employee(s) was already saved. You do not have permission to change saved attendance.`,
    );
  }
  try {
    await prisma.$transaction(
      async (tx) => {
        if (creates.length)
          await tx.staffAttendance.createMany({ data: creates });
        for (const u of updates)
          await tx.staffAttendance.update({
            where: { id: u.id },
            data: u.data,
          });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw ApiError.conflict(
        "Attendance for some employees was just saved by someone else. Reload the register.",
      );
    throw e;
  }
  return { created: creates.length, updated: updates.length, unchanged };
}

// ---------------- Reports ----------------
const sum = (cs: Counts[]) =>
  cs.reduce(
    (t, c) => ({
      present: t.present + c.present,
      absent: t.absent + c.absent,
      late: t.late + c.late,
      leave: t.leave + c.leave,
      halfDay: t.halfDay + c.halfDay,
    }),
    emptyCounts(),
  );
const groupWhere = (q: StaffReportQuery): Prisma.EmployeeWhereInput => ({
  ...(q.group && { isTeacher: q.group === "teachers" }),
  ...(q.departmentId && { departmentId: q.departmentId }),
});

async function daily(q: StaffReportQuery): Promise<Report> {
  const date = q.date ?? todayUtc();
  const emps = await eligible(date, q.group, q.departmentId);
  const marks = await prisma.staffAttendance.findMany({
    where: { date, employeeId: { in: emps.map((e) => e.id) } },
    select: { employeeId: true, status: true },
  });
  const statusOf = new Map(marks.map((m) => [m.employeeId, m.status]));

  const byDept = new Map<string, { staff: number; c: Counts }>();
  emps.forEach((e) => {
    const key = e.department?.name ?? "No department";
    const d = byDept.get(key) ?? { staff: 0, c: emptyCounts() };
    d.staff++;
    const s = statusOf.get(e.id);
    if (s) addStatus(d.c, s);
    byDept.set(key, d);
  });
  const row = (department: string, staff: number, c: Counts) => ({
    department,
    staff,
    present: c.present,
    absent: c.absent,
    late: c.late,
    leave: c.leave,
    halfDay: c.halfDay,
    notMarked: Math.max(0, staff - recorded(c)),
    percent: attendancePercent(c),
  });
  const lines = [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const rows = lines.map(([name, d]) => row(name, d.staff, d.c));
  if (lines.length)
    rows.push(row("Total", emps.length, sum(lines.map(([, d]) => d.c))));

  return {
    title: `Daily staff attendance ${iso(date)}`,
    columns: [
      { key: "department", header: "Department", width: 20 },
      { key: "staff", header: "Staff", width: 8 },
      { key: "present", header: "Present", width: 10 },
      { key: "absent", header: "Absent", width: 10 },
      { key: "late", header: "Late", width: 8 },
      { key: "leave", header: "Leave", width: 8 },
      { key: "halfDay", header: "Half day", width: 10 },
      { key: "notMarked", header: "Not marked", width: 12 },
      { key: "percent", header: "Attendance %", kind: "percent", width: 14 },
    ],
    rows,
    note: "Not marked means attendance has not been taken for that person on this date.",
  };
}

async function monthly(q: StaffReportQuery): Promise<Report> {
  const month = q.month ?? iso(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));

  const emps = await prisma.employee.findMany({
    where: {
      joiningDate: { lte: to },
      OR: [{ leavingDate: null }, { leavingDate: { gte: from } }],
      ...groupWhere(q),
    },
    orderBy: { fullName: "asc" },
    include: { designation: { select: { name: true } } },
  });
  const records = await prisma.staffAttendance.findMany({
    where: {
      employeeId: { in: emps.map((e) => e.id) },
      date: { gte: from, lte: to },
    },
    select: { employeeId: true, date: true, status: true },
  });

  const days = [...new Set(records.map((r) => r.date.getUTCDate()))].sort(
    (a, b) => a - b,
  );
  const per = new Map<string, Map<number, Status>>();
  records.forEach((r) => {
    const d = per.get(r.employeeId) ?? new Map<number, Status>();
    d.set(r.date.getUTCDate(), r.status);
    per.set(r.employeeId, d);
  });

  const rows = emps.map((e) => {
    const marks = per.get(e.id) ?? new Map<number, Status>();
    const c = emptyCounts();
    marks.forEach((s) => addStatus(c, s));
    const base: Record<string, string | number | null> = {
      code: e.employeeNo,
      employee: e.fullName,
      designation: e.designation.name,
    };
    days.forEach((d) => {
      const s = marks.get(d);
      base[`d${d}`] = s ? LETTER[s] : "";
    });
    return {
      ...base,
      present: c.present,
      absent: c.absent,
      late: c.late,
      leave: c.leave,
      halfDay: c.halfDay,
      percent: attendancePercent(c),
    };
  });

  return {
    title: `Monthly staff attendance ${month}`,
    columns: [
      { key: "code", header: "No", width: 12 },
      { key: "employee", header: "Employee", width: 26 },
      { key: "designation", header: "Designation", width: 16 },
      ...days.map((d) => ({
        key: `d${d}`,
        header: String(d),
        kind: "status" as const,
        width: 4,
      })),
      { key: "present", header: "P", width: 6 },
      { key: "absent", header: "A", width: 6 },
      { key: "late", header: "L", width: 6 },
      { key: "leave", header: "V", width: 6 },
      { key: "halfDay", header: "H", width: 6 },
      { key: "percent", header: "%", kind: "percent", width: 8 },
    ],
    rows,
    note:
      days.length === 0
        ? "No attendance has been saved in this month."
        : "P present, A absent, L late, V leave, H half day. Columns are the days attendance was taken.",
  };
}

async function byStatus(
  q: StaffReportQuery,
  status: "ABSENT" | "LATE",
): Promise<Report> {
  const to = q.to ?? todayUtc();
  const from = q.from ?? addDays(to, -6);
  if (from > to)
    throw ApiError.badRequest("The start date is after the end date");

  const records = await prisma.staffAttendance.findMany({
    where: { status, date: { gte: from, lte: to }, employee: groupWhere(q) },
    take: 5000,
    include: {
      employee: {
        select: {
          employeeNo: true,
          fullName: true,
          phone: true,
          designation: { select: { name: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  records.sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      a.employee.fullName.localeCompare(b.employee.fullName),
  );

  return {
    title: `${status === "ABSENT" ? "Absent staff" : "Late arrivals (staff)"} ${iso(from)} to ${iso(to)}`,
    columns: [
      { key: "date", header: "Date", width: 13 },
      { key: "no", header: "No", width: 12 },
      { key: "employee", header: "Employee", width: 26 },
      { key: "designation", header: "Designation", width: 16 },
      { key: "department", header: "Department", width: 16 },
      { key: "phone", header: "Phone", width: 16 },
      { key: "checkIn", header: "Check-in", width: 10 },
      { key: "remarks", header: "Remarks", width: 26 },
    ],
    rows: records.map((r) => ({
      date: iso(r.date),
      no: r.employee.employeeNo,
      employee: r.employee.fullName,
      designation: r.employee.designation.name,
      department: r.employee.department?.name ?? "",
      phone: r.employee.phone,
      checkIn: r.checkIn ?? "",
      remarks: r.remarks ?? "",
    })),
  };
}

export function buildStaffReport(
  type: StaffReportType,
  q: StaffReportQuery,
): Promise<Report> {
  switch (type) {
    case "daily":
      return daily(q);
    case "monthly":
      return monthly(q);
    case "absentees":
      return byStatus(q, "ABSENT");
    case "late":
      return byStatus(q, "LATE");
  }
}

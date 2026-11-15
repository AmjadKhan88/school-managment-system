import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  addStatus,
  attendancePercent,
  Counts,
  emptyCounts,
  LETTER,
  recorded,
} from "./attendance.calc";
import type { ReportQuery, ReportType } from "./attendance.schema";

export interface ReportCol {
  key: string;
  header: string;
  kind?: "status" | "percent";
  width?: number;
}
type Cell = string | number | null;
export interface Report {
  title: string;
  columns: ReportCol[];
  rows: Record<string, Cell>[];
  note?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(iso(new Date()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
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

const guardianSelect = {
  guardians: {
    orderBy: { isPrimary: "desc" as const },
    take: 1,
    select: { guardian: { select: { fullName: true, phone: true } } },
  },
};

// ---------------- Daily summary ----------------
async function daily(q: ReportQuery, sessionId: string): Promise<Report> {
  const date = q.date ?? todayUtc();
  const [enrolled, groups] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["sectionId"],
      _count: { _all: true },
      where: {
        sessionId,
        status: "ENROLLED",
        student: { status: "ACTIVE", archivedAt: null },
      },
    }),
    prisma.studentAttendance.groupBy({
      by: ["sectionId", "status"],
      _count: { _all: true },
      where: { sessionId, date },
    }),
  ]);
  const sections = await prisma.section.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...enrolled.map((e) => e.sectionId),
            ...groups.map((g) => g.sectionId),
          ]),
        ],
      },
    },
    include: { class: { select: { name: true, level: true } } },
  });
  const sm = new Map(sections.map((s) => [s.id, s]));

  const counts = new Map<string, Counts>();
  const countsOf = (id: string) => {
    let c = counts.get(id);
    if (!c) {
      c = emptyCounts();
      counts.set(id, c);
    }
    return c;
  };
  groups.forEach((g) =>
    addStatus(countsOf(g.sectionId), g.status, g._count._all),
  );

  const lines = enrolled
    .map((e) => {
      const s = sm.get(e.sectionId);
      const c = countsOf(e.sectionId);
      return {
        level: s?.class.level ?? 0,
        sectionName: s?.name ?? "",
        c,
        enrolled: e._count._all,
        className: s?.class.name ?? "—",
      };
    })
    .sort(
      (a, b) => a.level - b.level || a.sectionName.localeCompare(b.sectionName),
    );

  const row = (cls: string, sec: string, enrolledN: number, c: Counts) => ({
    class: cls,
    section: sec,
    enrolled: enrolledN,
    present: c.present,
    absent: c.absent,
    late: c.late,
    leave: c.leave,
    halfDay: c.halfDay,
    notMarked: Math.max(0, enrolledN - recorded(c)),
    percent: attendancePercent(c),
  });
  const rows = lines.map((l) =>
    row(l.className, l.sectionName, l.enrolled, l.c),
  );
  if (lines.length)
    rows.push(
      row(
        "Total",
        "",
        lines.reduce((s, l) => s + l.enrolled, 0),
        sum(lines.map((l) => l.c)),
      ),
    );

  return {
    title: `Daily attendance ${iso(date)}`,
    columns: [
      { key: "class", header: "Class", width: 14 },
      { key: "section", header: "Section", width: 10 },
      { key: "enrolled", header: "Enrolled", width: 10 },
      { key: "present", header: "Present", width: 10 },
      { key: "absent", header: "Absent", width: 10 },
      { key: "late", header: "Late", width: 8 },
      { key: "leave", header: "Leave", width: 8 },
      { key: "halfDay", header: "Half day", width: 10 },
      { key: "notMarked", header: "Not marked", width: 12 },
      { key: "percent", header: "Attendance %", kind: "percent", width: 14 },
    ],
    rows,
    note: 'Sections with students "Not marked" have not taken attendance, or have only marked some students.',
  };
}

// ---------------- Monthly register ----------------
async function monthly(q: ReportQuery, sessionId: string): Promise<Report> {
  if (!q.classId) throw ApiError.badRequest("Choose a class");
  const month = q.month ?? iso(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const scope = {
    sessionId,
    classId: q.classId,
    ...(q.sectionId && { sectionId: q.sectionId }),
  };

  const [records, enrollments] = await Promise.all([
    prisma.studentAttendance.findMany({
      where: { ...scope, date: { gte: from, lte: to } },
      select: { studentId: true, date: true, status: true },
    }),
    prisma.enrollment.findMany({
      where: {
        ...scope,
        status: "ENROLLED",
        student: { status: "ACTIVE", archivedAt: null },
      },
      orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
      include: {
        student: { select: { fullName: true, admissionNo: true } },
        section: { select: { name: true } },
      },
    }),
  ]);

  const days = [...new Set(records.map((r) => r.date.getUTCDate()))].sort(
    (a, b) => a - b,
  );
  const perStudent = new Map<
    string,
    Map<number, (typeof records)[number]["status"]>
  >();
  records.forEach((r) => {
    const d = perStudent.get(r.studentId) ?? new Map();
    d.set(r.date.getUTCDate(), r.status);
    perStudent.set(r.studentId, d);
  });

  const rows = enrollments.map((e) => {
    const marks = perStudent.get(e.studentId) ?? new Map();
    const c = emptyCounts();
    marks.forEach((s) => addStatus(c, s));
    const base: Record<string, Cell> = {
      roll: e.rollNo,
      student: e.student.fullName,
      admissionNo: e.student.admissionNo,
      section: e.section.name,
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
    title: `Monthly attendance ${month}`,
    columns: [
      { key: "roll", header: "Roll", width: 7 },
      { key: "student", header: "Student", width: 26 },
      { key: "admissionNo", header: "Adm no", width: 14 },
      ...(q.sectionId ? [] : [{ key: "section", header: "Sec", width: 7 }]),
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
        ? "No attendance has been saved for this class in this month."
        : "P present, A absent, L late, V leave, H half day. Columns are the days attendance was taken.",
  };
}

// ---------------- Absent students / late arrivals ----------------
async function byStatus(
  q: ReportQuery,
  sessionId: string,
  status: "ABSENT" | "LATE",
): Promise<Report> {
  const to = q.to ?? todayUtc();
  const from = q.from ?? addDays(to, -6);
  if (from > to)
    throw ApiError.badRequest("The start date is after the end date");

  const records = await prisma.studentAttendance.findMany({
    where: {
      sessionId,
      status,
      date: { gte: from, lte: to },
      ...(q.classId && { classId: q.classId }),
      ...(q.sectionId && { sectionId: q.sectionId }),
    },
    take: 5000,
    include: {
      student: {
        select: { fullName: true, admissionNo: true, ...guardianSelect },
      },
      class: { select: { name: true, level: true } },
      section: { select: { name: true } },
    },
  });
  records.sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      a.class.level - b.class.level ||
      a.student.fullName.localeCompare(b.student.fullName),
  );

  return {
    title: `${status === "ABSENT" ? "Absent students" : "Late arrivals"} ${iso(from)} to ${iso(to)}`,
    columns: [
      { key: "date", header: "Date", width: 13 },
      { key: "student", header: "Student", width: 26 },
      { key: "admissionNo", header: "Adm no", width: 14 },
      { key: "class", header: "Class", width: 12 },
      { key: "section", header: "Section", width: 9 },
      { key: "guardian", header: "Parent", width: 22 },
      { key: "phone", header: "Phone", width: 16 },
      { key: "remarks", header: "Remarks", width: 26 },
    ],
    rows: records.map((r) => ({
      date: iso(r.date),
      student: r.student.fullName,
      admissionNo: r.student.admissionNo,
      class: r.class.name,
      section: r.section.name,
      guardian: r.student.guardians[0]?.guardian.fullName ?? "",
      phone: r.student.guardians[0]?.guardian.phone ?? "",
      remarks: r.remarks ?? "",
    })),
  };
}

// ---------------- Low attendance alerts ----------------
async function low(q: ReportQuery, sessionId: string): Promise<Report> {
  const to = q.to ?? todayUtc();
  const from = q.from ?? addDays(to, -29);
  if (from > to)
    throw ApiError.badRequest("The start date is after the end date");

  const groups = await prisma.studentAttendance.groupBy({
    by: ["studentId", "status"],
    _count: { _all: true },
    where: {
      sessionId,
      date: { gte: from, lte: to },
      ...(q.classId && { classId: q.classId }),
    },
  });
  const per = new Map<string, Counts>();
  groups.forEach((g) => {
    const c = per.get(g.studentId) ?? emptyCounts();
    addStatus(c, g.status, g._count._all);
    per.set(g.studentId, c);
  });

  const flagged = [...per.entries()]
    .map(([studentId, c]) => ({ studentId, c, p: attendancePercent(c) }))
    .filter(
      (x): x is { studentId: string; c: Counts; p: number } =>
        x.p !== null && recorded(x.c) >= q.minDays && x.p < q.threshold,
    )
    .sort((a, b) => a.p - b.p);

  const students = await prisma.student.findMany({
    where: { id: { in: flagged.map((f) => f.studentId) } },
    select: {
      id: true,
      fullName: true,
      admissionNo: true,
      ...guardianSelect,
      enrollments: {
        where: { sessionId },
        take: 1,
        select: {
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });
  const sm = new Map(students.map((s) => [s.id, s]));

  return {
    title: `Low attendance below ${q.threshold}% (${iso(from)} to ${iso(to)})`,
    columns: [
      { key: "student", header: "Student", width: 26 },
      { key: "admissionNo", header: "Adm no", width: 14 },
      { key: "class", header: "Class", width: 12 },
      { key: "section", header: "Section", width: 9 },
      { key: "present", header: "Present", width: 9 },
      { key: "absent", header: "Absent", width: 9 },
      { key: "late", header: "Late", width: 8 },
      { key: "leave", header: "Leave", width: 8 },
      { key: "days", header: "Days recorded", width: 14 },
      { key: "percent", header: "Attendance %", kind: "percent", width: 14 },
      { key: "guardian", header: "Parent", width: 22 },
      { key: "phone", header: "Phone", width: 16 },
    ],
    rows: flagged.map((f) => {
      const s = sm.get(f.studentId);
      const en = s?.enrollments[0];
      return {
        student: s?.fullName ?? "",
        admissionNo: s?.admissionNo ?? "",
        class: en?.class.name ?? "",
        section: en?.section.name ?? "",
        present: f.c.present,
        absent: f.c.absent,
        late: f.c.late,
        leave: f.c.leave,
        days: recorded(f.c),
        percent: f.p,
        guardian: s?.guardians[0]?.guardian.fullName ?? "",
        phone: s?.guardians[0]?.guardian.phone ?? "",
      };
    }),
    note: `Only students with at least ${q.minDays} recorded days are listed, so a single absence early in the term does not raise an alert.`,
  };
}

export function buildReport(
  type: ReportType,
  q: ReportQuery,
  sessionId: string,
): Promise<Report> {
  switch (type) {
    case "daily":
      return daily(q, sessionId);
    case "monthly":
      return monthly(q, sessionId);
    case "absentees":
      return byStatus(q, sessionId, "ABSENT");
    case "late":
      return byStatus(q, sessionId, "LATE");
    case "low":
      return low(q, sessionId);
  }
}

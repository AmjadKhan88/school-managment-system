import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  DAY_NAMES,
  DEFAULT_DAYS,
  datesBetween,
  dateOfDay,
  isoDay,
  LeaveSpan,
  leaveOn,
  mondayOf,
  slotConflicts,
  validatePeriod,
  weekdayOf,
} from "./timetable.calc";
import type { EntryInput, PeriodInput, PrintQuery } from "./timetable.schema";

type Tx = Prisma.TransactionClient;
const OPTS = { timeout: 30_000, maxWait: 10_000 };
const todayUtc = () => new Date(isoDay(new Date()));

const entryInclude = {
  subject: { select: { id: true, name: true } },
  employee: { select: { id: true, fullName: true, employeeNo: true } },
  room: { select: { id: true, name: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
  period: { select: { name: true, startTime: true, sortOrder: true } },
};
type EntryRow = Prisma.TimetableEntryGetPayload<{
  include: typeof entryInclude;
}>;

// ---------------- Setup ----------------
async function workingDaysOf(sessionId: string) {
  const c = await prisma.timetableConfig.findUnique({ where: { sessionId } });
  return c && c.workingDays.length
    ? [...c.workingDays].sort((a, b) => a - b)
    : DEFAULT_DAYS;
}

export async function getSetup(sessionId: string) {
  const [workingDays, periods, rooms] = await Promise.all([
    workingDaysOf(sessionId),
    prisma.timetablePeriod.findMany({
      where: { sessionId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.room.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    workingDays,
    periods: periods.map((p) => ({
      id: p.id,
      sortOrder: p.sortOrder,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      isBreak: p.isBreak,
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      isActive: r.isActive,
    })),
  };
}

export async function saveConfig(sessionId: string, workingDays: number[]) {
  const outside = await prisma.timetableEntry.count({
    where: { sessionId, dayOfWeek: { notIn: workingDays } },
  });
  if (outside > 0)
    throw ApiError.conflict(
      `${outside} timetable entr${outside === 1 ? "y is" : "ies are"} on a day you are switching off. Clear them first.`,
    );
  const days = [...new Set(workingDays)].sort((a, b) => a - b);
  await prisma.timetableConfig.upsert({
    where: { sessionId },
    create: { sessionId, workingDays: days },
    update: { workingDays: days },
  });
  return { workingDays: days };
}

/** Keeps the order numbers in step with start times. Two passes avoid clashing with the unique order number. */
async function renumber(tx: Tx, sessionId: string) {
  const all = await tx.timetablePeriod.findMany({
    where: { sessionId },
    orderBy: { startTime: "asc" },
    select: { id: true },
  });
  for (const [i, p] of all.entries())
    await tx.timetablePeriod.update({
      where: { id: p.id },
      data: { sortOrder: 1000 + i },
    });
  for (const [i, p] of all.entries())
    await tx.timetablePeriod.update({
      where: { id: p.id },
      data: { sortOrder: i + 1 },
    });
}

export async function createPeriod(input: PeriodInput) {
  const others = await prisma.timetablePeriod.findMany({
    where: { sessionId: input.sessionId },
    select: { id: true, startTime: true, endTime: true, sortOrder: true },
  });
  const problem = validatePeriod(input, others);
  if (problem) throw ApiError.badRequest(problem);
  return prisma.$transaction(async (tx) => {
    const row = await tx.timetablePeriod.create({
      data: {
        ...input,
        sortOrder: others.reduce((m, p) => Math.max(m, p.sortOrder), 0) + 1,
      },
      select: { id: true },
    });
    await renumber(tx, input.sessionId);
    return row;
  }, OPTS);
}

export async function updatePeriod(
  id: string,
  input: Omit<PeriodInput, "sessionId">,
) {
  const p = await prisma.timetablePeriod.findUnique({ where: { id } });
  if (!p) throw ApiError.notFound("Period not found");
  const others = await prisma.timetablePeriod.findMany({
    where: { sessionId: p.sessionId },
    select: { id: true, startTime: true, endTime: true },
  });
  const problem = validatePeriod({ id, ...input }, others);
  if (problem) throw ApiError.badRequest(problem);
  if (
    input.isBreak &&
    (await prisma.timetableEntry.count({ where: { periodId: id } })) > 0
  )
    throw ApiError.conflict(
      "Classes are scheduled in this period, so it cannot become a break. Clear them first.",
    );
  await prisma.$transaction(async (tx) => {
    await tx.timetablePeriod.update({ where: { id }, data: input });
    await renumber(tx, p.sessionId);
  }, OPTS);
  return { id };
}

export async function deletePeriod(id: string) {
  const p = await prisma.timetablePeriod.findUnique({ where: { id } });
  if (!p) throw ApiError.notFound("Period not found");
  const used = await prisma.timetableEntry.count({ where: { periodId: id } });
  if (used > 0)
    throw ApiError.conflict(
      `${used} timetable entr${used === 1 ? "y uses" : "ies use"} this period. Clear them first.`,
    );
  await prisma.$transaction(async (tx) => {
    await tx.timetablePeriod.delete({ where: { id } });
    await renumber(tx, p.sessionId);
  }, OPTS);
  return { id };
}

export async function createDefaultPeriods(sessionId: string) {
  if ((await prisma.timetablePeriod.count({ where: { sessionId } })) > 0)
    throw ApiError.conflict("This session already has periods");
  const rows: [string, string, string, boolean][] = [
    ["Period 1", "08:00", "08:40", false],
    ["Period 2", "08:40", "09:20", false],
    ["Period 3", "09:20", "10:00", false],
    ["Break", "10:00", "10:30", true],
    ["Period 4", "10:30", "11:10", false],
    ["Period 5", "11:10", "11:50", false],
    ["Period 6", "11:50", "12:30", false],
    ["Period 7", "12:30", "13:10", false],
  ];
  await prisma.timetablePeriod.createMany({
    data: rows.map(([name, startTime, endTime, isBreak], i) => ({
      sessionId,
      sortOrder: i + 1,
      name,
      startTime,
      endTime,
      isBreak,
    })),
  });
  return { created: rows.length };
}

// ---------------- Entries ----------------
export async function saveEntry(input: EntryInput, canEdit: boolean) {
  const [section, period, days, mapped] = await Promise.all([
    prisma.section.findUnique({
      where: { id: input.sectionId },
      include: { class: { select: { name: true } } },
    }),
    prisma.timetablePeriod.findUnique({ where: { id: input.periodId } }),
    workingDaysOf(input.sessionId),
    prisma.section
      .findUnique({ where: { id: input.sectionId }, select: { classId: true } })
      .then((s) =>
        s
          ? prisma.classSubject.count({
              where: { classId: s.classId, subjectId: input.subjectId },
            })
          : 0,
      ),
  ]);
  if (!section || !section.isActive)
    throw ApiError.badRequest("Choose an active section");
  if (!period || period.sessionId !== input.sessionId)
    throw ApiError.badRequest("That period does not belong to this session");
  if (period.isBreak)
    throw ApiError.badRequest("Classes cannot be scheduled in a break");
  if (!days.includes(input.dayOfWeek))
    throw ApiError.badRequest(
      `${DAY_NAMES[input.dayOfWeek - 1]} is not a working day`,
    );
  if (mapped === 0)
    throw ApiError.badRequest("That subject is not mapped to this class");

  let teacherName: string | undefined;
  if (input.employeeId) {
    const t = await prisma.employee.findFirst({
      where: { id: input.employeeId, isTeacher: true, status: "ACTIVE" },
      select: { fullName: true },
    });
    if (!t) throw ApiError.badRequest("Only active teachers can be scheduled");
    teacherName = t.fullName;
  }
  let roomName: string | undefined;
  if (input.roomId) {
    const r = await prisma.room.findFirst({
      where: { id: input.roomId, isActive: true },
      select: { name: true },
    });
    if (!r) throw ApiError.badRequest("Choose an active room");
    roomName = r.name;
  }

  const existing = await prisma.timetableEntry.findUnique({
    where: {
      sessionId_sectionId_dayOfWeek_periodId: {
        sessionId: input.sessionId,
        sectionId: input.sectionId,
        dayOfWeek: input.dayOfWeek,
        periodId: input.periodId,
      },
    },
  });
  if (existing && !canEdit)
    throw ApiError.forbidden(
      "This slot is already filled. You do not have permission to change it.",
    );

  const clash = [
    ...(input.employeeId ? [{ employeeId: input.employeeId }] : []),
    ...(input.roomId ? [{ roomId: input.roomId }] : []),
  ];
  const others =
    clash.length === 0
      ? []
      : await prisma.timetableEntry.findMany({
          where: {
            sessionId: input.sessionId,
            dayOfWeek: input.dayOfWeek,
            periodId: input.periodId,
            sectionId: { not: input.sectionId },
            OR: clash,
          },
          include: {
            class: { select: { name: true } },
            section: { select: { name: true } },
            subject: { select: { name: true } },
          },
        });
  const conflicts = slotConflicts(
    {
      sectionId: input.sectionId,
      employeeId: input.employeeId,
      roomId: input.roomId,
    },
    others.map((o) => ({
      sectionId: o.sectionId,
      employeeId: o.employeeId,
      roomId: o.roomId,
      label: `${o.class.name} ${o.section.name} (${o.subject.name})`,
    })),
    { teacher: teacherName, room: roomName ? `Room ${roomName}` : undefined },
  );
  if (conflicts.length)
    throw new ApiError(
      409,
      "This slot conflicts with the timetable. Nothing was saved.",
      { conflicts },
    );

  const data = {
    classId: section.classId,
    subjectId: input.subjectId,
    employeeId: input.employeeId,
    roomId: input.roomId,
  };
  try {
    const row = existing
      ? await prisma.timetableEntry.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        })
      : await prisma.timetableEntry.create({
          data: {
            sessionId: input.sessionId,
            sectionId: input.sectionId,
            dayOfWeek: input.dayOfWeek,
            periodId: input.periodId,
            ...data,
          },
          select: { id: true },
        });
    return { id: row.id, replaced: !!existing };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw ApiError.conflict(
        "Someone else just filled a clashing slot. Reload and try again.",
      );
    throw e;
  }
}

export async function deleteEntry(id: string) {
  const e = await prisma.timetableEntry.findUnique({ where: { id } });
  if (!e) throw ApiError.notFound("Timetable entry not found");
  await prisma.timetableEntry.delete({ where: { id } }); // a plain schedule slot, not a financial record
  return { id, sessionId: e.sessionId };
}

/** What a manager needs to fill a slot: the class's subjects, who is assigned to teach each, and the active teachers. */
export async function entryOptions(sessionId: string, sectionId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, classId: true },
  });
  if (!section) throw ApiError.notFound("Section not found");
  const [mapped, assigned, teachers] = await Promise.all([
    prisma.classSubject.findMany({
      where: { classId: section.classId, subject: { isActive: true } },
      include: { subject: { select: { id: true, name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    prisma.teacherAssignment.findMany({
      where: { sessionId, sectionId },
      select: { subjectId: true, employeeId: true },
    }),
    prisma.employee.findMany({
      where: { isTeacher: true, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, employeeNo: true, fullName: true },
    }),
  ]);
  return {
    subjects: mapped.map((m) => m.subject),
    assigned: Object.fromEntries(
      assigned.map((a) => [a.subjectId, a.employeeId]),
    ),
    teachers,
  };
}

// ---------------- Grids ----------------
async function leaveSpans(
  from: Date,
  to: Date,
  employeeIds?: string[],
): Promise<LeaveSpan[]> {
  if (employeeIds && employeeIds.length === 0) return [];
  const rows = await prisma.leaveApplication.findMany({
    where: {
      applicantType: "EMPLOYEE",
      status: "APPROVED",
      employeeId: employeeIds ? { in: employeeIds } : { not: null },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      applicationNo: true,
      leaveType: true,
    },
  });
  return rows.map((r) => ({
    employeeId: r.employeeId!,
    start: isoDay(r.startDate),
    end: isoDay(r.endDate),
    applicationNo: r.applicationNo,
    type: r.leaveType,
  }));
}

const weekDays = (workingDays: number[], weekOf?: Date) => {
  const monday = mondayOf(weekOf ?? todayUtc());
  return {
    monday,
    sunday: dateOfDay(monday, 7),
    days: workingDays.map((d) => ({
      day: d,
      date: isoDay(dateOfDay(monday, d)),
    })),
  };
};

export async function classGrid(
  sessionId: string,
  sectionId: string,
  weekOf: Date | undefined,
  withLeave: boolean,
) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!section) throw ApiError.notFound("Section not found");
  const [setup, entries] = await Promise.all([
    getSetup(sessionId),
    prisma.timetableEntry.findMany({
      where: { sessionId, sectionId },
      include: entryInclude,
    }),
  ]);
  const { monday, sunday, days } = weekDays(setup.workingDays, weekOf);
  const spans = withLeave
    ? await leaveSpans(monday, sunday, [
        ...new Set(
          entries.map((e) => e.employeeId).filter((x): x is string => !!x),
        ),
      ])
    : [];

  return {
    section: {
      id: section.id,
      name: section.name,
      classId: section.class.id,
      className: section.class.name,
    },
    days,
    periods: setup.periods,
    entries: entries.map((e) => {
      const leave =
        e.employeeId && withLeave
          ? leaveOn(spans, e.employeeId, isoDay(dateOfDay(monday, e.dayOfWeek)))
          : null;
      return {
        id: e.id,
        dayOfWeek: e.dayOfWeek,
        periodId: e.periodId,
        subject: e.subject,
        teacher: e.employee
          ? { id: e.employee.id, name: e.employee.fullName }
          : null,
        room: e.room,
        leave: leave
          ? { applicationNo: leave.applicationNo, type: leave.type }
          : null,
      };
    }),
  };
}

export async function teacherGrid(
  sessionId: string,
  employeeId: string,
  weekOf: Date | undefined,
  withLeave: boolean,
) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, employeeNo: true },
  });
  if (!emp) throw ApiError.notFound("Teacher not found");
  const [setup, entries] = await Promise.all([
    getSetup(sessionId),
    prisma.timetableEntry.findMany({
      where: { sessionId, employeeId },
      include: entryInclude,
    }),
  ]);
  const { monday, sunday, days } = weekDays(setup.workingDays, weekOf);
  const spans = withLeave ? await leaveSpans(monday, sunday, [employeeId]) : [];

  return {
    employee: { id: emp.id, name: emp.fullName, employeeNo: emp.employeeNo },
    days: days.map((d) => {
      const l = withLeave ? leaveOn(spans, employeeId, d.date) : null;
      return {
        ...d,
        leave: l ? { applicationNo: l.applicationNo, type: l.type } : null,
      };
    }),
    periods: setup.periods,
    weeklyPeriods: entries.length,
    entries: entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      subject: e.subject,
      className: e.class.name,
      sectionName: e.section.name,
      room: e.room,
    })),
  };
}

export async function teachersWithLoad(sessionId: string) {
  const [teachers, groups] = await Promise.all([
    prisma.employee.findMany({
      where: { isTeacher: true, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, employeeNo: true, fullName: true },
    }),
    prisma.timetableEntry.groupBy({
      by: ["employeeId"],
      where: { sessionId, employeeId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const load = new Map(groups.map((g) => [g.employeeId, g._count._all]));
  return teachers.map((t) => ({ ...t, periods: load.get(t.id) ?? 0 }));
}

/** Periods whose teacher is on approved leave on the date: someone needs to cover them. */
export async function coverNeeded(sessionId: string, from: Date, to: Date) {
  const spans = await leaveSpans(from, to);
  if (spans.length === 0) return [];
  const entries = await prisma.timetableEntry.findMany({
    where: {
      sessionId,
      employeeId: { in: [...new Set(spans.map((s) => s.employeeId))] },
    },
    include: entryInclude,
  });
  const rows: {
    date: string;
    day: string;
    order: number;
    period: string;
    time: string;
    className: string;
    sectionName: string;
    subject: string;
    teacher: string;
    employeeNo: string;
    applicationNo: string;
  }[] = [];
  for (const date of datesBetween(isoDay(from), isoDay(to))) {
    const dow = weekdayOf(new Date(`${date}T00:00:00Z`));
    for (const e of entries.filter((x) => x.dayOfWeek === dow)) {
      const l = leaveOn(spans, e.employeeId!, date);
      if (l)
        rows.push({
          date,
          day: DAY_NAMES[dow - 1],
          order: e.period.sortOrder,
          period: e.period.name,
          time: e.period.startTime,
          className: e.class.name,
          sectionName: e.section.name,
          subject: e.subject.name,
          teacher: e.employee!.fullName,
          employeeNo: e.employee!.employeeNo,
          applicationNo: l.applicationNo,
        });
    }
  }
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.order - b.order ||
      a.className.localeCompare(b.className),
  );
}

// ---------------- Printing ----------------
const cellOf = (e: EntryRow, mode: "class" | "teacher") => ({
  dayOfWeek: e.dayOfWeek,
  periodId: e.periodId,
  title: e.subject.name,
  subtitle:
    mode === "class"
      ? (e.employee?.fullName ?? "")
      : `${e.class.name} ${e.section.name}`,
  room: e.room?.name ?? null,
});

export async function printData(schoolId: string, q: PrintQuery) {
  const [school, session, setup] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, address: true, phone: true, logoUrl: true },
    }),
    prisma.academicSession.findUnique({
      where: { id: q.sessionId },
      select: { name: true },
    }),
    getSetup(q.sessionId),
  ]);
  const days = setup.workingDays.map((d) => ({
    day: d,
    name: DAY_NAMES[d - 1],
  }));
  const grids: {
    title: string;
    subtitle: string | null;
    cells: ReturnType<typeof cellOf>[];
  }[] = [];

  if (q.type === "class") {
    if (!q.sectionId && !q.classId)
      throw ApiError.badRequest("Choose a section or a class");
    const sections = await prisma.section.findMany({
      where: q.sectionId
        ? { id: q.sectionId }
        : { classId: q.classId, isActive: true },
      orderBy: { name: "asc" },
      include: { class: { select: { name: true } } },
    });
    const ids = sections.map((s) => s.id);
    const [entries, teachers] = await Promise.all([
      prisma.timetableEntry.findMany({
        where: { sessionId: q.sessionId, sectionId: { in: ids } },
        include: entryInclude,
      }),
      prisma.classTeacherAssignment.findMany({
        where: { sessionId: q.sessionId, sectionId: { in: ids } },
        include: { employee: { select: { fullName: true } } },
      }),
    ]);
    sections.forEach((s) =>
      grids.push({
        title: `${s.class.name}, Section ${s.name}`,
        subtitle: teachers.find((t) => t.sectionId === s.id)
          ? `Class teacher: ${teachers.find((t) => t.sectionId === s.id)!.employee.fullName}`
          : null,
        cells: entries
          .filter((e) => e.sectionId === s.id)
          .map((e) => cellOf(e, "class")),
      }),
    );
  } else {
    const entries = await prisma.timetableEntry.findMany({
      where: {
        sessionId: q.sessionId,
        ...(q.employeeId
          ? { employeeId: q.employeeId }
          : { employeeId: { not: null } }),
      },
      include: entryInclude,
    });
    const people = new Map(entries.map((e) => [e.employeeId!, e.employee!]));
    if (q.employeeId && !people.has(q.employeeId)) {
      const t = await prisma.employee.findUnique({
        where: { id: q.employeeId },
        select: { id: true, fullName: true, employeeNo: true },
      });
      if (t) people.set(t.id, t);
    }
    [...people.values()]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .forEach((t) =>
        grids.push({
          title: t.fullName,
          subtitle: t.employeeNo,
          cells: entries
            .filter((e) => e.employeeId === t.id)
            .map((e) => cellOf(e, "teacher")),
        }),
      );
  }
  return {
    school: school ?? { name: "", address: null, phone: null, logoUrl: null },
    session: session?.name ?? "",
    periods: setup.periods,
    days,
    grids,
  };
}

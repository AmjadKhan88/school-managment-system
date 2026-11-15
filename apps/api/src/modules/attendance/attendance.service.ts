import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { withinEditWindow } from "./attendance.calc";
import type { RegisterQuery, SaveRegister } from "./attendance.schema";

/** Active students enrolled in the section, with any attendance already saved for the date. */
export async function loadRegister(q: RegisterQuery) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId: q.sessionId,
      classId: q.classId,
      sectionId: q.sectionId,
      status: "ENROLLED",
      student: { status: "ACTIVE", archivedAt: null },
    },
    orderBy: [{ rollNo: "asc" }, { student: { fullName: "asc" } }],
    include: {
      student: {
        select: {
          id: true,
          admissionNo: true,
          fullName: true,
          fatherName: true,
        },
      },
    },
  });
  const rows = await prisma.studentAttendance.findMany({
    where: {
      date: q.date,
      studentId: { in: enrollments.map((e) => e.studentId) },
    },
  });
  const byStudent = new Map(rows.map((r) => [r.studentId, r]));

  const userIds = rows
    .flatMap((r) => [r.markedById, r.updatedById])
    .filter((x): x is string => !!x);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, fullName: true },
  });
  const name = new Map(users.map((u) => [u.id, u.fullName]));

  return {
    date: q.date.toISOString().slice(0, 10),
    taken: rows.length > 0,
    students: enrollments.map((e) => {
      const a = byStudent.get(e.studentId);
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        rollNo: e.rollNo,
        admissionNo: e.student.admissionNo,
        fullName: e.student.fullName,
        fatherName: e.student.fatherName,
        status: a?.status ?? null,
        remarks: a?.remarks ?? null,
        markedBy: a?.markedById ? (name.get(a.markedById) ?? null) : null,
        updatedBy: a?.updatedById ? (name.get(a.updatedById) ?? null) : null,
      };
    }),
  };
}

interface Who {
  id: string;
  canEdit: boolean;
  canApprove: boolean;
}

export async function saveRegister(input: SaveRegister, who: Who) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  if (!who.canApprove && !withinEditWindow(input.date, today)) {
    throw ApiError.forbidden(
      "Attendance older than 7 days can only be recorded or changed by an approver",
    );
  }

  const ids = input.entries.map((e) => e.enrollmentId);
  const enrollments = await prisma.enrollment.findMany({
    where: {
      id: { in: ids },
      sessionId: input.sessionId,
      classId: input.classId,
      sectionId: input.sectionId,
      status: "ENROLLED",
      student: { status: "ACTIVE", archivedAt: null },
    },
    select: { id: true, studentId: true },
  });
  if (enrollments.length !== ids.length)
    throw ApiError.badRequest(
      "Some students are not enrolled in this class and section. Reload the register and try again.",
    );

  const studentOf = new Map(enrollments.map((e) => [e.id, e.studentId]));
  const existing = await prisma.studentAttendance.findMany({
    where: { date: input.date, studentId: { in: [...studentOf.values()] } },
  });
  const byStudent = new Map(existing.map((x) => [x.studentId, x]));

  const creates: Prisma.StudentAttendanceCreateManyInput[] = [];
  const updates: {
    id: string;
    enrollmentId: string;
    status: SaveRegister["entries"][number]["status"];
    remarks: string | null;
  }[] = [];
  let unchanged = 0;

  for (const e of input.entries) {
    const studentId = studentOf.get(e.enrollmentId)!;
    const ex = byStudent.get(studentId);
    if (!ex) {
      creates.push({
        enrollmentId: e.enrollmentId,
        studentId,
        sessionId: input.sessionId,
        classId: input.classId,
        sectionId: input.sectionId,
        date: input.date,
        status: e.status,
        remarks: e.remarks ?? null,
        markedById: who.id,
      });
    } else if (
      ex.status !== e.status ||
      (ex.remarks ?? null) !== (e.remarks ?? null)
    ) {
      updates.push({
        id: ex.id,
        enrollmentId: e.enrollmentId,
        status: e.status,
        remarks: e.remarks ?? null,
      });
    } else unchanged++;
  }

  if (updates.length > 0 && !who.canEdit) {
    throw ApiError.forbidden(
      `Attendance for ${updates.length} student(s) was already saved. You do not have permission to change saved attendance.`,
    );
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        if (creates.length)
          await tx.studentAttendance.createMany({ data: creates });
        for (const u of updates) {
          await tx.studentAttendance.update({
            where: { id: u.id },
            data: {
              status: u.status,
              remarks: u.remarks,
              updatedById: who.id,
              enrollmentId: u.enrollmentId,
              sessionId: input.sessionId,
              classId: input.classId,
              sectionId: input.sectionId,
            },
          });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw ApiError.conflict(
        "Attendance for some of these students was just saved by someone else. Reload the register.",
      );
    }
    throw e;
  }
  return { created: creates.length, updated: updates.length, unchanged };
}

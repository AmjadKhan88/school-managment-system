import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  addStatus,
  attendancePercent,
  emptyCounts,
  recorded,
} from "../attendance/attendance.calc";
import { bandRanges } from "./grading.calc";
import { normalise, sameRemark } from "./reportcards.calc";
import type { RemarksInput } from "./reportcards.schema";

const n = (d: { toString(): string } | null | undefined) =>
  d === null || d === undefined ? null : Number(d.toString());

/** Everything needed to print report cards for a class (or one student). Published results only. */
export async function buildCards(
  schoolId: string,
  examId: string,
  classId: string,
  filter: { studentId?: string; sectionId?: string },
) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      classes: true,
      session: { select: { name: true, startDate: true } },
    },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  const ec = exam.classes.find((c) => c.classId === classId);
  if (!ec) throw ApiError.badRequest("That class does not sit this exam");
  if (!ec.resultsPublishedAt)
    throw ApiError.conflict(
      "Results for this class are not published yet. Publish them under Class Results first.",
    );

  const [school, cls, papers, scale, classSize] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        name: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    }),
    prisma.class.findUnique({ where: { id: classId }, select: { name: true } }),
    prisma.examSubject.findMany({
      where: { examId, classId },
      include: { subject: { select: { name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    exam.gradingScaleId
      ? prisma.gradingScale.findUnique({
          where: { id: exam.gradingScaleId },
          include: { bands: true },
        })
      : prisma.gradingScale.findFirst({
          where: { isDefault: true },
          include: { bands: true },
        }),
    prisma.examResult.count({ where: { examId, classId } }),
  ]);

  const results = await prisma.examResult.findMany({
    where: {
      examId,
      classId,
      ...(filter.studentId && { studentId: filter.studentId }),
      ...(filter.sectionId && { enrollment: { sectionId: filter.sectionId } }),
    },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          fatherName: true,
          admissionNo: true,
          photoUrl: true,
        },
      },
      enrollment: {
        select: { rollNo: true, section: { select: { name: true } } },
      },
    },
  });
  const ids = results.map((r) => r.studentId);

  const [marks, remarks, attendance] = await Promise.all([
    prisma.examMark.findMany({
      where: { examSubject: { examId, classId }, studentId: { in: ids } },
    }),
    prisma.reportCardRemark.findMany({
      where: { examId, studentId: { in: ids } },
    }),
    prisma.studentAttendance.groupBy({
      by: ["studentId", "status"],
      _count: { _all: true },
      where: {
        sessionId: exam.sessionId,
        studentId: { in: ids },
        date: { gte: exam.session.startDate, lte: exam.endDate },
      },
    }),
  ]);
  const markOf = new Map(
    marks.map((m) => [`${m.studentId}:${m.examSubjectId}`, m]),
  );
  const remarkOf = new Map(remarks.map((r) => [r.studentId, r]));
  const attOf = new Map<string, ReturnType<typeof emptyCounts>>();
  attendance.forEach((g) => {
    const c = attOf.get(g.studentId) ?? emptyCounts();
    addStatus(c, g.status, g._count._all);
    attOf.set(g.studentId, c);
  });

  const bands = (scale?.bands ?? []).map((b) => ({
    grade: b.grade,
    minPercent: Number(b.minPercent),
    gradePoint: Number(b.gradePoint),
    remark: b.remark,
  }));
  const remarkByGrade = new Map(bands.map((b) => [b.grade, b.remark]));

  const cards = results
    .sort(
      (a, b) =>
        a.enrollment.section.name.localeCompare(b.enrollment.section.name) ||
        (a.enrollment.rollNo ?? 9999) - (b.enrollment.rollNo ?? 9999),
    )
    .map((r) => {
      const att = attOf.get(r.studentId) ?? emptyCounts();
      const rem = remarkOf.get(r.studentId);
      return {
        student: {
          ...r.student,
          rollNo: r.enrollment.rollNo,
          section: r.enrollment.section.name,
        },
        subjects: papers.map((p) => {
          const m = markOf.get(`${r.studentId}:${p.id}`);
          const obtained =
            !m || m.status === "EXEMPT"
              ? null
              : m.status === "ABSENT"
                ? 0
                : (n(m.theory) ?? 0) + (n(m.practical) ?? 0);
          return {
            name: p.subject.name,
            totalMarks: p.totalMarks,
            passingMarks: p.passingMarks,
            practicalMarks: p.practicalMarks,
            status: m?.status ?? null,
            theory: m?.status === "ENTERED" ? n(m.theory) : null,
            practical: m?.status === "ENTERED" ? n(m.practical) : null,
            obtained,
            grade: m?.grade ?? null,
            passed: m?.passed ?? null,
            remark: m?.grade ? (remarkByGrade.get(m.grade) ?? null) : null,
          };
        }),
        totals: {
          obtained: Number(r.totalObtained),
          max: Number(r.totalMax),
          percentage: n(r.percentage),
          grade: r.grade,
          gradeRemark: r.grade ? (remarkByGrade.get(r.grade) ?? null) : null,
          gpa: n(r.gpa),
          result: r.result,
          failedSubjects: r.failedSubjects,
          position: r.position,
        },
        attendance: {
          ...att,
          recorded: recorded(att),
          percent: attendancePercent(att),
        },
        remarks: {
          teacher: rem?.teacherRemarks ?? null,
          principal: rem?.principalRemarks ?? null,
        },
      };
    });

  return {
    school: school ?? {
      name: "",
      address: null,
      phone: null,
      email: null,
      logoUrl: null,
    },
    exam: {
      id: exam.id,
      name: exam.name,
      type: exam.type,
      session: exam.session.name,
      startDate: exam.startDate,
      endDate: exam.endDate,
    },
    className: cls?.name ?? "",
    classSize,
    grading: { name: scale?.name ?? "", bands: bandRanges(bands) },
    cards,
  };
}

export async function saveRemarks(
  input: RemarksInput,
  who: { id: string; canTeacher: boolean; canPrincipal: boolean },
) {
  const exam = await prisma.exam.findUnique({
    where: { id: input.examId },
    include: { classes: true },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  if (!exam.classes.some((c) => c.classId === input.classId))
    throw ApiError.badRequest("That class does not sit this exam");

  const ids = input.entries.map((e) => e.studentId);
  const published = await prisma.examResult.findMany({
    where: {
      examId: input.examId,
      classId: input.classId,
      studentId: { in: ids },
    },
    select: { studentId: true },
  });
  if (published.length !== ids.length)
    throw ApiError.conflict(
      "Remarks can only be written for students whose results are published.",
    );

  const existing = await prisma.reportCardRemark.findMany({
    where: { examId: input.examId, studentId: { in: ids } },
  });
  const byStudent = new Map(existing.map((r) => [r.studentId, r]));

  const changes = input.entries
    .map((e) => {
      const ex = byStudent.get(e.studentId);
      const teacher =
        e.teacherRemarks !== undefined &&
        !sameRemark(e.teacherRemarks, ex?.teacherRemarks);
      const principal =
        e.principalRemarks !== undefined &&
        !sameRemark(e.principalRemarks, ex?.principalRemarks);
      return { e, teacher, principal };
    })
    .filter((c) => c.teacher || c.principal);

  if (changes.some((c) => c.teacher) && !who.canTeacher)
    throw ApiError.forbidden(
      "You do not have permission to change teacher remarks",
    );
  if (changes.some((c) => c.principal) && !who.canPrincipal)
    throw ApiError.forbidden(
      "You do not have permission to change principal remarks",
    );

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      const data = {
        ...(c.teacher && { teacherRemarks: normalise(c.e.teacherRemarks) }),
        ...(c.principal && {
          principalRemarks: normalise(c.e.principalRemarks),
        }),
        updatedById: who.id,
      };
      await tx.reportCardRemark.upsert({
        where: {
          examId_studentId: { examId: input.examId, studentId: c.e.studentId },
        },
        create: { examId: input.examId, studentId: c.e.studentId, ...data },
        update: data,
      });
    }
  });
  return {
    updated: changes.length,
    unchanged: input.entries.length - changes.length,
  };
}

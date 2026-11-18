import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { enrolledStudents } from "./marks.service";
import {
  Band,
  computeOutcome,
  MarkInfo,
  PaperInfo,
  rankPass,
} from "./results.calc";

const OPTS = { timeout: 60_000, maxWait: 10_000 };

async function bandsFor(exam: {
  gradingScaleId: string | null;
}): Promise<Band[]> {
  const scale = exam.gradingScaleId
    ? await prisma.gradingScale.findUnique({
        where: { id: exam.gradingScaleId },
        include: { bands: true },
      })
    : await prisma.gradingScale.findFirst({
        where: { isDefault: true },
        include: { bands: true },
      });
  if (!scale)
    throw ApiError.conflict(
      "No grading scale is set up. Create one under Grading System.",
    );
  return scale.bands.map((b) => ({
    grade: b.grade,
    minPercent: Number(b.minPercent),
    gradePoint: Number(b.gradePoint),
  }));
}

async function gather(examId: string, classId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { classes: true, session: { select: { name: true } } },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  const ec = exam.classes.find((c) => c.classId === classId);
  if (!ec) throw ApiError.badRequest("That class does not sit this exam");
  const [cls, papers] = await Promise.all([
    prisma.class.findUnique({ where: { id: classId }, select: { name: true } }),
    prisma.examSubject.findMany({
      where: { examId, classId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
  ]);
  return { exam, ec, className: cls?.name ?? "", papers };
}
type Gathered = Awaited<ReturnType<typeof gather>>;

/** Live calculation from the marks as they stand now. */
async function liveOutcomes(g: Gathered) {
  const students = await enrolledStudents(g.exam.sessionId, g.ec.classId);
  const [marks, bands] = await Promise.all([
    prisma.examMark.findMany({
      where: {
        examSubject: { examId: g.exam.id, classId: g.ec.classId },
        studentId: { in: students.map((s) => s.studentId) },
      },
    }),
    bandsFor(g.exam),
  ]);
  const infos: PaperInfo[] = g.papers.map((p) => ({
    id: p.id,
    name: p.subject.name,
    totalMarks: p.totalMarks,
    practicalMarks: p.practicalMarks,
    passingMarks: p.passingMarks,
  }));
  const per = new Map<string, Map<string, MarkInfo>>();
  marks.forEach((m) => {
    const inner = per.get(m.studentId) ?? new Map<string, MarkInfo>();
    inner.set(m.examSubjectId, {
      status: m.status,
      theory: m.theory,
      practical: m.practical,
    });
    per.set(m.studentId, inner);
  });
  const items = students.map((s) => ({
    s,
    outcome: computeOutcome(infos, per.get(s.studentId) ?? new Map(), bands),
  }));
  const positions = rankPass(
    items.map((i) => ({
      key: i.s.id,
      percentage: i.outcome.percentage,
      result: i.outcome.result,
    })),
  );
  return { items, positions };
}

const fixed = (d: Prisma.Decimal | null | undefined) =>
  d === null || d === undefined ? null : d.toFixed(2);

export async function loadClassResults(
  examId: string,
  classId: string,
  sectionId?: string,
) {
  const g = await gather(examId, classId);
  const published = !!g.ec.resultsPublishedAt;

  type Row = {
    enrollmentId: string;
    studentId: string;
    rollNo: number | null;
    section: string;
    sectionId: string | null;
    admissionNo: string;
    fullName: string;
    subjects: {
      paperId: string;
      status: string | null;
      obtained: string | null;
      grade: string | null;
      passed: boolean | null;
    }[];
    totalObtained: string;
    totalMax: string;
    percentage: string | null;
    grade: string | null;
    gpa: string | null;
    result: string;
    failedSubjects: number;
    position: number | null;
  };
  let students: Row[];

  if (!published) {
    const { items, positions } = await liveOutcomes(g);
    students = items.map(({ s, outcome: o }) => ({
      enrollmentId: s.id,
      studentId: s.studentId,
      rollNo: s.rollNo,
      section: s.section.name,
      sectionId: s.sectionId,
      admissionNo: s.student.admissionNo,
      fullName: s.student.fullName,
      subjects: o.subjects.map((x) => ({
        paperId: x.paperId,
        status: x.status,
        obtained: fixed(x.obtained),
        grade: x.grade,
        passed: x.passed,
      })),
      totalObtained: o.totalObtained.toFixed(2),
      totalMax: o.totalMax.toFixed(2),
      percentage: fixed(o.percentage),
      grade: o.grade,
      gpa: fixed(o.gpa),
      result: o.result,
      failedSubjects: o.failedSubjects,
      position: positions.get(s.id) ?? null,
    }));
  } else {
    const rows = await prisma.examResult.findMany({
      where: { examId, classId },
      include: {
        enrollment: {
          select: {
            rollNo: true,
            sectionId: true,
            section: { select: { name: true } },
          },
        },
        student: { select: { admissionNo: true, fullName: true } },
      },
    });
    const marks = await prisma.examMark.findMany({
      where: {
        examSubject: { examId, classId },
        studentId: { in: rows.map((r) => r.studentId) },
      },
    });
    const markOf = new Map(
      marks.map((m) => [`${m.studentId}:${m.examSubjectId}`, m]),
    );
    students = rows.map((r) => ({
      enrollmentId: r.enrollmentId,
      studentId: r.studentId,
      rollNo: r.enrollment.rollNo,
      section: r.enrollment.section.name,
      sectionId: r.enrollment.sectionId,
      admissionNo: r.student.admissionNo,
      fullName: r.student.fullName,
      subjects: g.papers.map((p) => {
        const m = markOf.get(`${r.studentId}:${p.id}`);
        return {
          paperId: p.id,
          status: m?.status ?? null,
          obtained:
            !m || m.status === "EXEMPT"
              ? null
              : m.status === "ABSENT"
                ? "0.00"
                : (m.theory ?? new Prisma.Decimal(0))
                    .plus(m.practical ?? 0)
                    .toFixed(2),
          grade: m?.grade ?? null,
          passed: m?.passed ?? null,
        };
      }),
      totalObtained: r.totalObtained.toFixed(2),
      totalMax: r.totalMax.toFixed(2),
      percentage: fixed(r.percentage),
      grade: r.grade,
      gpa: fixed(r.gpa),
      result: r.result,
      failedSubjects: r.failedSubjects,
      position: r.position,
    }));
  }

  students.sort(
    (a, b) =>
      a.section.localeCompare(b.section) ||
      (a.rollNo ?? 9999) - (b.rollNo ?? 9999),
  );
  const shown = sectionId
    ? students.filter((s) => s.sectionId === sectionId)
    : students;
  const pct = shown
    .map((s) => Number(s.percentage))
    .filter((n) => (!isNaN(n) && n > 0) || n === 0);
  const withPct = shown
    .filter((s) => s.percentage !== null)
    .map((s) => Number(s.percentage));

  return {
    exam: {
      id: g.exam.id,
      name: g.exam.name,
      type: g.exam.type,
      status: g.exam.status,
      session: g.exam.session.name,
    },
    className: g.className,
    published,
    publishedAt: g.ec.resultsPublishedAt,
    subjects: g.papers.map((p) => ({
      paperId: p.id,
      name: p.subject.name,
      totalMarks: p.totalMarks,
      passingMarks: p.passingMarks,
    })),
    students: shown,
    summary: {
      students: shown.length,
      passed: shown.filter((s) => s.result === "PASS").length,
      failed: shown.filter((s) => s.result === "FAIL").length,
      incomplete: shown.filter((s) => s.result === "INCOMPLETE").length,
      average: withPct.length
        ? Math.round(
            (withPct.reduce((a, b) => a + b, 0) / withPct.length) * 100,
          ) / 100
        : null,
      highest: withPct.length ? Math.max(...withPct) : null,
    },
    _unused: pct.length, // keeps the helper above referenced
  };
}

export async function publishResults(
  examId: string,
  classId: string,
  userId: string,
) {
  const g = await gather(examId, classId);
  if (g.ec.resultsPublishedAt)
    throw ApiError.conflict("Results for this class are already published");
  if (g.exam.status !== "PUBLISHED")
    throw ApiError.conflict(
      "The exam must be published before its results can be published",
    );
  if (g.papers.length === 0)
    throw ApiError.conflict("This class has no papers in the exam");

  const { items, positions } = await liveOutcomes(g);
  if (items.length === 0)
    throw ApiError.conflict("No active students are enrolled in this class");

  const missing = g.papers
    .map((p) => ({
      subject: p.subject.name,
      names: items
        .filter(
          (i) =>
            i.outcome.subjects.find((s) => s.paperId === p.id)?.status === null,
        )
        .map((i) => i.s.student.fullName),
    }))
    .filter((m) => m.names.length > 0);
  if (missing.length) {
    throw new ApiError(409, "Marks are incomplete. Nothing was published.", {
      missing: missing.map((m) => ({
        subject: m.subject,
        count: m.names.length,
        sample: m.names.slice(0, 5),
      })),
    });
  }
  const allExempt = items.find((i) => i.outcome.totalMax.eq(0));
  if (allExempt)
    throw ApiError.conflict(
      `${allExempt.s.student.fullName} is exempt from every paper, so no result can be calculated. Remove an exemption first.`,
    );

  return prisma.$transaction(async (tx) => {
    for (const { s, outcome } of items) {
      for (const sub of outcome.subjects) {
        await tx.examMark.update({
          where: {
            examSubjectId_studentId: {
              examSubjectId: sub.paperId,
              studentId: s.studentId,
            },
          },
          data: {
            grade: sub.grade,
            gradePoint: sub.gradePoint,
            passed: sub.passed,
          },
        });
      }
    }
    await tx.examResult.createMany({
      data: items.map(({ s, outcome: o }) => ({
        examId,
        classId,
        enrollmentId: s.id,
        studentId: s.studentId,
        totalObtained: o.totalObtained,
        totalMax: o.totalMax,
        percentage: o.percentage,
        grade: o.grade,
        gpa: o.gpa,
        result: o.result === "PASS" ? ("PASS" as const) : ("FAIL" as const),
        failedSubjects: o.failedSubjects,
        position: positions.get(s.id) ?? null,
        publishedById: userId,
      })),
    });
    await tx.examClass.update({
      where: { examId_classId: { examId, classId } },
      data: { resultsPublishedAt: new Date(), resultsPublishedById: userId },
    });
    const left = await tx.examClass.count({
      where: { examId, resultsPublishedAt: null },
    });
    if (left === 0)
      await tx.exam.update({
        where: { id: examId },
        data: { status: "COMPLETED" },
      });
    return { students: items.length, examCompleted: left === 0 };
  }, OPTS);
}

export async function unpublishResults(examId: string, classId: string) {
  const g = await gather(examId, classId);
  if (!g.ec.resultsPublishedAt)
    throw ApiError.conflict("Results for this class are not published");
  return prisma.$transaction(async (tx) => {
    await tx.examMark.updateMany({
      where: { examSubject: { examId, classId } },
      data: { grade: null, gradePoint: null, passed: null },
    });
    const removed = await tx.examResult.deleteMany({
      where: { examId, classId },
    });
    await tx.examClass.update({
      where: { examId_classId: { examId, classId } },
      data: { resultsPublishedAt: null, resultsPublishedById: null },
    });
    if (g.exam.status === "COMPLETED")
      await tx.exam.update({
        where: { id: examId },
        data: { status: "PUBLISHED" },
      });
    return { removed: removed.count };
  }, OPTS);
}

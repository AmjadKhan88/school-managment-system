import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { findConflicts, Slot } from "./exams.calc";
import type { ExamInput, ScheduleInput } from "./exams.schema";

type Tx = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const OPTS = { timeout: 30_000, maxWait: 10_000 };
interface ClassDefault {
  classId: string;
  totalMarks: number;
  passingMarks: number;
}

/** Creates a paper for every subject mapped to the class that does not have one yet. */
async function generateSubjects(
  tx: Tx,
  examId: string,
  classes: ClassDefault[],
) {
  const mapped = await tx.classSubject.findMany({
    where: {
      classId: { in: classes.map((c) => c.classId) },
      subject: { isActive: true },
    },
    select: { classId: true, subjectId: true },
  });
  const existing = await tx.examSubject.findMany({
    where: { examId },
    select: { classId: true, subjectId: true },
  });
  const have = new Set(existing.map((e) => `${e.classId}:${e.subjectId}`));
  const defaults = new Map(classes.map((c) => [c.classId, c]));

  const data = mapped
    .filter((m) => !have.has(`${m.classId}:${m.subjectId}`))
    .map((m) => ({
      examId,
      classId: m.classId,
      subjectId: m.subjectId,
      totalMarks: defaults.get(m.classId)!.totalMarks,
      passingMarks: defaults.get(m.classId)!.passingMarks,
    }));
  if (data.length) await tx.examSubject.createMany({ data });

  const withSubjects = new Set(mapped.map((m) => m.classId));
  return {
    created: data.length,
    classesWithoutSubjects: classes
      .map((c) => c.classId)
      .filter((id) => !withSubjects.has(id)),
  };
}

async function checkInputs(input: ExamInput) {
  const session = await prisma.academicSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session) throw ApiError.notFound("Academic session not found");
  if (input.startDate < session.startDate || input.endDate > session.endDate) {
    throw ApiError.badRequest(
      `The exam dates must fall inside session ${session.name} (${iso(session.startDate)} to ${iso(session.endDate)})`,
    );
  }
  const classIds = input.classes.map((c) => c.classId);
  const found = await prisma.class.count({
    where: { id: { in: classIds }, isActive: true },
  });
  if (found !== classIds.length)
    throw ApiError.badRequest(
      "One of the selected classes is missing or inactive",
    );
  if (
    input.gradingScaleId &&
    !(await prisma.gradingScale.findFirst({
      where: { id: input.gradingScaleId, isActive: true },
    }))
  ) {
    throw ApiError.badRequest("The chosen grading scale is not available");
  }
}

export async function createExam(input: ExamInput, userId: string) {
  await checkInputs(input);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        name: input.name,
        type: input.type,
        sessionId: input.sessionId,
        startDate: input.startDate,
        endDate: input.endDate,
        gradingScaleId: input.gradingScaleId ?? null,
        notes: input.notes,
        createdById: userId,
        classes: { create: input.classes },
      },
      select: { id: true },
    });
    const g = await generateSubjects(tx, exam.id, input.classes);
    return {
      id: exam.id,
      papersCreated: g.created,
      classesWithoutSubjects: g.classesWithoutSubjects,
    };
  }, OPTS);
}

export async function updateExam(id: string, input: ExamInput) {
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: { classes: true },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  if (exam.status === "COMPLETED")
    throw ApiError.conflict("This exam is completed and locked");
  if (input.sessionId !== exam.sessionId)
    throw ApiError.badRequest("The session of an exam cannot be changed");
  await checkInputs(input);

  const outside = await prisma.examSubject.count({
    where: {
      examId: id,
      examDate: { not: null },
      OR: [
        { examDate: { lt: input.startDate } },
        { examDate: { gt: input.endDate } },
      ],
    },
  });
  if (outside > 0)
    throw ApiError.conflict(
      `${outside} scheduled paper(s) fall outside the new dates. Change their dates first.`,
    );

  const keep = new Set(input.classes.map((c) => c.classId));
  const removed = exam.classes
    .map((c) => c.classId)
    .filter((c) => !keep.has(c));
  const current = new Set(exam.classes.map((c) => c.classId));
  const added = input.classes.filter((c) => !current.has(c.classId));

  return prisma.$transaction(async (tx) => {
    await tx.exam.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        gradingScaleId: input.gradingScaleId ?? null,
        notes: input.notes ?? null,
      },
    });
    if (removed.length) {
      await tx.examSubject.deleteMany({
        where: { examId: id, classId: { in: removed } },
      });
      await tx.examClass.deleteMany({
        where: { examId: id, classId: { in: removed } },
      });
    }
    for (const c of input.classes.filter((c) => current.has(c.classId))) {
      await tx.examClass.update({
        where: { examId_classId: { examId: id, classId: c.classId } },
        data: { totalMarks: c.totalMarks, passingMarks: c.passingMarks },
      });
    }
    if (added.length)
      await tx.examClass.createMany({
        data: added.map((c) => ({ examId: id, ...c })),
      });
    const g = await generateSubjects(tx, id, input.classes);
    return {
      id,
      papersCreated: g.created,
      classesWithoutSubjects: g.classesWithoutSubjects,
    };
  }, OPTS);
}

/** Adds papers for subjects mapped to the classes after the exam was created. Existing papers are untouched. */
export async function syncSubjects(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { classes: true },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  if (exam.status === "COMPLETED")
    throw ApiError.conflict("This exam is completed and locked");
  return prisma.$transaction(
    (tx) => generateSubjects(tx, examId, exam.classes),
    OPTS,
  );
}

export async function setStatus(examId: string, status: "DRAFT" | "PUBLISHED") {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw ApiError.notFound("Exam not found");
  if (exam.status === "COMPLETED")
    throw ApiError.conflict("This exam is completed and locked");
  if (exam.status === status) return { id: examId, status };

  if (status === "PUBLISHED") {
    const total = await prisma.examSubject.count({ where: { examId } });
    if (total === 0)
      throw ApiError.conflict(
        "This exam has no papers yet. Map subjects to its classes first.",
      );
    const unscheduled = await prisma.examSubject.count({
      where: {
        examId,
        OR: [{ examDate: null }, { startTime: null }, { endTime: null }],
      },
    });
    if (unscheduled > 0)
      throw ApiError.conflict(
        `${unscheduled} paper(s) still have no date and time. Complete the schedule before publishing.`,
      );
  }
  await prisma.exam.update({ where: { id: examId }, data: { status } });
  return { id: examId, status };
}

export async function saveSchedule(examId: string, input: ScheduleInput) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { classes: true },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  if (exam.status === "COMPLETED")
    throw ApiError.conflict("This exam is completed and locked");
  if (!exam.classes.some((c) => c.classId === input.classId))
    throw ApiError.badRequest("That class does not sit this exam");

  const papers = await prisma.examSubject.findMany({
    where: { examId, classId: input.classId },
    select: { subjectId: true },
  });
  const known = new Set(papers.map((p) => p.subjectId));
  if (input.rows.some((r) => !known.has(r.subjectId)))
    throw ApiError.badRequest(
      'A subject is not part of this exam. Use "Sync subjects" and reload.',
    );

  const outside = input.rows.filter(
    (r) =>
      r.examDate && (r.examDate < exam.startDate || r.examDate > exam.endDate),
  );
  if (outside.length)
    throw ApiError.badRequest(
      `Paper dates must be between ${iso(exam.startDate)} and ${iso(exam.endDate)}`,
    );

  // ---- Conflicts: this exam's other papers, and papers in other exams on the same dates ----
  const edits = new Map(input.rows.map((r) => [r.subjectId, r]));
  const all = await prisma.examSubject.findMany({
    where: { examId },
    include: {
      subject: { select: { name: true } },
      class: { select: { name: true } },
    },
  });
  const slots: Slot[] = [];
  for (const p of all) {
    const touched = p.classId === input.classId && edits.has(p.subjectId);
    const src = touched
      ? edits.get(p.subjectId)!
      : {
          examDate: p.examDate ?? undefined,
          startTime: p.startTime ?? undefined,
          endTime: p.endTime ?? undefined,
          room: p.room ?? undefined,
        };
    if (src.examDate && src.startTime && src.endTime) {
      slots.push({
        classId: p.classId,
        label: `${p.class.name} ${p.subject.name}`,
        date: iso(src.examDate),
        start: src.startTime,
        end: src.endTime,
        room: src.room ?? null,
        touched,
      });
    }
  }
  const dates = [
    ...new Set(
      input.rows.filter((r) => r.examDate).map((r) => iso(r.examDate!)),
    ),
  ];
  if (dates.length) {
    const others = await prisma.examSubject.findMany({
      where: {
        examId: { not: examId },
        examDate: { in: dates.map((d) => new Date(d)) },
        startTime: { not: null },
        endTime: { not: null },
      },
      include: {
        subject: { select: { name: true } },
        class: { select: { name: true } },
        exam: { select: { name: true } },
      },
    });
    others.forEach((p) =>
      slots.push({
        classId: p.classId,
        label: `${p.exam.name}: ${p.class.name} ${p.subject.name}`,
        date: iso(p.examDate!),
        start: p.startTime!,
        end: p.endTime!,
        room: p.room,
        touched: false,
      }),
    );
  }
  const conflicts = findConflicts(slots);
  if (conflicts.length)
    throw new ApiError(409, "The schedule has conflicts. Nothing was saved.", {
      conflicts,
    });

  await prisma.$transaction(async (tx) => {
    for (const r of input.rows) {
      await tx.examSubject.update({
        where: {
          examId_classId_subjectId: {
            examId,
            classId: input.classId,
            subjectId: r.subjectId,
          },
        },
        data: {
          examDate: r.examDate ?? null,
          startTime: r.startTime ?? null,
          endTime: r.endTime ?? null,
          room: r.room ?? null,
          totalMarks: r.totalMarks,
          practicalMarks: r.practicalMarks,
          passingMarks: r.passingMarks,
        },
      });
    }
  }, OPTS);
  return { updated: input.rows.length };
}

/** Printable date sheet: one block per class, papers in date and time order, unscheduled ones last. */
export async function dateSheet(examId: string, classId?: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { session: { select: { name: true } } },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  const papers = await prisma.examSubject.findMany({
    where: { examId, ...(classId && { classId }) },
    include: {
      subject: { select: { name: true } },
      class: { select: { name: true, level: true } },
    },
  });

  const byClass = new Map<
    string,
    { className: string; level: number; rows: typeof papers }
  >();
  papers.forEach((p) => {
    const e = byClass.get(p.classId) ?? {
      className: p.class.name,
      level: p.class.level,
      rows: [],
    };
    e.rows.push(p);
    byClass.set(p.classId, e);
  });

  const weekday = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return {
    exam: {
      id: exam.id,
      name: exam.name,
      type: exam.type,
      session: exam.session.name,
      startDate: exam.startDate,
      endDate: exam.endDate,
      status: exam.status,
    },
    classes: [...byClass.values()]
      .sort((a, b) => a.level - b.level)
      .map((c) => ({
        className: c.className,
        rows: c.rows
          .sort(
            (a, b) =>
              (a.examDate?.getTime() ?? Infinity) -
                (b.examDate?.getTime() ?? Infinity) ||
              (a.startTime ?? "").localeCompare(b.startTime ?? ""),
          )
          .map((p) => ({
            date: p.examDate ? iso(p.examDate) : null,
            day: p.examDate ? weekday(p.examDate) : null,
            subject: p.subject.name,
            startTime: p.startTime,
            endTime: p.endTime,
            room: p.room,
            totalMarks: p.totalMarks,
          })),
      })),
  };
}

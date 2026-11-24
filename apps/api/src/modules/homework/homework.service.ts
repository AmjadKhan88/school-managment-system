import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { nextNo } from "../finance/finance.service";
import { displayName, validateUpload } from "../finance/uploads";
import { scopeFor, TeacherScope } from "../staff/scope";
import {
  HOMEWORK_ROOT,
  pathIn,
  removeFrom,
  saveTo,
  SUBMISSION_ROOT,
} from "./files";
import { canSubmit, isLate, summarise, Track, trackOf } from "./homework.calc";
import type {
  HomeworkEdit,
  HomeworkInput,
  ListQuery,
  ReviewInput,
} from "./homework.schema";

type User = { id: string; roles: string[] };
type Ctx = { scope: TeacherScope | null; employeeId: string | null };
type File = Express.Multer.File;
const OPTS = { timeout: 30_000, maxWait: 10_000 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(iso(new Date()));
const MAX_ATTACHMENTS = 5;

const activeSessionId = async () =>
  (
    await prisma.academicSession.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
  )?.id;

async function ctxFor(user: User, sessionId: string): Promise<Ctx> {
  const [scope, emp] = await Promise.all([
    scopeFor(user, sessionId),
    prisma.employee.findFirst({
      where: { userId: user.id },
      select: { id: true },
    }),
  ]);
  return { scope, employeeId: emp?.id ?? null };
}
/** A scoped teacher sees their own homework and homework in sections they are class teacher of. */
const canView = (c: Ctx, hw: { employeeId: string; sectionId: string }) =>
  !c.scope ||
  hw.employeeId === c.employeeId ||
  c.scope.classTeacher.some((x) => x.sectionId === hw.sectionId);
/** Only the teacher responsible can change it (staff with wider roles can change any). */
const canModify = (c: Ctx, hw: { employeeId: string }) =>
  !c.scope || (c.employeeId !== null && hw.employeeId === c.employeeId);

const hwInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  employee: { select: { id: true, fullName: true } },
};

async function loadHw(user: User, id: string, need: "view" | "modify") {
  const hw = await prisma.homework.findUnique({
    where: { id },
    include: { ...hwInclude, attachments: true },
  });
  if (!hw) throw ApiError.notFound("Homework not found");
  const ctx = await ctxFor(user, hw.sessionId);
  if (!canView(ctx, hw))
    throw ApiError.forbidden("You can only see homework for your own classes");
  if (need === "modify" && !canModify(ctx, hw))
    throw ApiError.forbidden(
      "Only the teacher who set this homework can change it",
    );
  return { hw, ctx };
}

function checkFiles(files: File[]) {
  return files.map((f) => {
    const c = validateUpload(f);
    if ("error" in c)
      throw ApiError.badRequest(`${f.originalname}: ${c.error}`);
    return { file: f, ext: c.ext };
  });
}
async function storeAll(root: string, items: { file: File; ext: string }[]) {
  const saved: { stored: string; file: File }[] = [];
  try {
    for (const it of items)
      saved.push({
        stored: await saveTo(root, it.file.buffer, it.ext),
        file: it.file,
      });
  } catch (e) {
    await Promise.all(saved.map((s) => removeFrom(root, s.stored)));
    throw e;
  }
  return saved;
}
const fileRow = (s: { stored: string; file: File }) => ({
  fileName: displayName(s.file.originalname),
  storedName: s.stored,
  mimeType: s.file.mimetype,
  sizeBytes: s.file.size,
});

// ---------------- What a teacher may create ----------------
export async function options(user: User, sessionId: string) {
  const ctx = await ctxFor(user, sessionId);
  const [sections, mapped, assigned, teachers] = await Promise.all([
    prisma.section.findMany({
      where: { isActive: true, class: { isActive: true } },
      include: { class: { select: { id: true, name: true, level: true } } },
    }),
    prisma.classSubject.findMany({
      where: { subject: { isActive: true } },
      include: { subject: { select: { id: true, name: true } } },
    }),
    prisma.teacherAssignment.findMany({
      where: { sessionId },
      include: { employee: { select: { id: true, fullName: true } } },
    }),
    prisma.employee.findMany({
      where: { isTeacher: true, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, employeeNo: true, fullName: true },
    }),
  ]);
  const teaching = new Set(
    ctx.scope?.teaching.map((t) => `${t.sectionId}:${t.subjectId}`),
  );
  const teacherOf = new Map(
    assigned.map((a) => [`${a.sectionId}:${a.subjectId}`, a.employee]),
  );
  const combos = sections.flatMap((s) =>
    mapped
      .filter((m) => m.classId === s.classId)
      .flatMap((m) => {
        const key = `${s.id}:${m.subjectId}`;
        if (ctx.scope && !teaching.has(key)) return [];
        const t = teacherOf.get(key);
        return [
          {
            classId: s.class.id,
            className: s.class.name,
            level: s.class.level,
            sectionId: s.id,
            sectionName: s.name,
            subjectId: m.subject.id,
            subjectName: m.subject.name,
            teacher: t ? { id: t.id, name: t.fullName } : null,
          },
        ];
      }),
  );
  combos.sort(
    (a, b) =>
      a.level - b.level ||
      a.sectionName.localeCompare(b.sectionName) ||
      a.subjectName.localeCompare(b.subjectName),
  );
  return {
    restricted: !!ctx.scope,
    combos,
    teachers: ctx.scope ? [] : teachers,
  };
}

// ---------------- List ----------------
export async function listHomework(user: User, q: ListQuery) {
  const sessionId = q.sessionId ?? (await activeSessionId());
  if (!sessionId)
    return { page: q.page, pageSize: q.pageSize, total: 0, items: [] };
  const ctx = await ctxFor(user, sessionId);
  const and: Prisma.HomeworkWhereInput[] = [];
  if (ctx.scope)
    and.push({
      OR: [
        { employeeId: ctx.employeeId ?? "__none__" },
        { sectionId: { in: ctx.scope.classTeacher.map((c) => c.sectionId) } },
      ],
    });
  if (q.q)
    and.push({
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { homeworkNo: { contains: q.q, mode: "insensitive" } },
      ],
    });
  const where: Prisma.HomeworkWhereInput = {
    sessionId,
    ...(q.classId && { classId: q.classId }),
    ...(q.sectionId && { sectionId: q.sectionId }),
    ...(q.subjectId && { subjectId: q.subjectId }),
    ...(q.employeeId && { employeeId: q.employeeId }),
    ...(q.status && { status: q.status }),
    ...((q.from || q.to) && {
      dueDate: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) },
    }),
    ...(and.length && { AND: and }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.homework.findMany({
      where,
      include: hwInclude,
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.homework.count({ where }),
  ]);
  const [enrolled, subs] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["sectionId"],
      _count: { _all: true },
      where: {
        sessionId,
        status: "ENROLLED",
        sectionId: { in: rows.map((r) => r.sectionId) },
        student: { status: "ACTIVE", archivedAt: null },
      },
    }),
    prisma.homeworkSubmission.groupBy({
      by: ["homeworkId", "status"],
      _count: { _all: true },
      where: { homeworkId: { in: rows.map((r) => r.id) } },
    }),
  ]);
  const today = todayUtc();
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map((r) => {
      const n = (st: string) =>
        subs.find((s) => s.homeworkId === r.id && s.status === st)?._count
          ._all ?? 0;
      const totalStudents =
        enrolled.find((e) => e.sectionId === r.sectionId)?._count._all ?? 0;
      const done = n("SUBMITTED") + n("CHECKED");
      return {
        id: r.id,
        homeworkNo: r.homeworkNo,
        title: r.title,
        status: r.status,
        assignedOn: r.assignedOn,
        dueDate: r.dueDate,
        overdue: r.status === "ACTIVE" && isLate(r.dueDate, today),
        class: r.class.name,
        section: r.section.name,
        subject: r.subject.name,
        teacher: r.employee.fullName,
        total: totalStudents,
        done,
        checked: n("CHECKED"),
        redo: n("REDO"),
        percent: totalStudents ? Math.round((done / totalStudents) * 100) : 0,
      };
    }),
  };
}

// ---------------- Detail and tracking ----------------
type SubRow = Prisma.HomeworkSubmissionGetPayload<{ include: { files: true } }>;
const subShape = (s: SubRow) => ({
  id: s.id,
  status: s.status,
  late: s.late,
  note: s.note,
  submittedAt: s.submittedAt,
  onBehalf: s.onBehalf,
  marks: s.marks === null ? null : Number(s.marks),
  feedback: s.feedback,
  checkedAt: s.checkedAt,
  files: s.files.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    sizeBytes: f.sizeBytes,
  })),
});

export async function homeworkDetail(user: User, id: string) {
  const { hw, ctx } = await loadHw(user, id, "view");
  const [students, subs] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        sessionId: hw.sessionId,
        sectionId: hw.sectionId,
        status: "ENROLLED",
        student: { status: "ACTIVE", archivedAt: null },
      },
      orderBy: [{ rollNo: "asc" }],
      include: {
        student: { select: { id: true, admissionNo: true, fullName: true } },
      },
    }),
    prisma.homeworkSubmission.findMany({
      where: { homeworkId: id },
      include: { files: true },
    }),
  ]);
  const byStudent = new Map(subs.map((s) => [s.studentId, s]));
  const today = todayUtc();
  const rows = students.map((e) => {
    const s = byStudent.get(e.studentId) ?? null;
    return {
      studentId: e.studentId,
      rollNo: e.rollNo,
      admissionNo: e.student.admissionNo,
      fullName: e.student.fullName,
      track: trackOf(s, hw.dueDate, today) as Track,
      submission: s ? subShape(s) : null,
    };
  });
  return {
    id: hw.id,
    homeworkNo: hw.homeworkNo,
    title: hw.title,
    description: hw.description,
    assignedOn: hw.assignedOn,
    dueDate: hw.dueDate,
    maxMarks: hw.maxMarks,
    allowLate: hw.allowLate,
    status: hw.status,
    cancelReason: hw.cancelReason,
    className: hw.class.name,
    sectionName: hw.section.name,
    subject: hw.subject.name,
    teacher: hw.employee.fullName,
    attachments: hw.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
    })),
    summary: summarise(rows.map((r) => r.track)),
    rows,
    canModify: canModify(ctx, hw),
  };
}

// ---------------- Create, edit, cancel ----------------
export async function createHomework(
  user: User,
  input: HomeworkInput,
  files: File[],
) {
  const session = await prisma.academicSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true },
  });
  if (!session) throw ApiError.notFound("Academic session not found");
  const sectionIds = [...new Set(input.sectionIds)];
  const sections = await prisma.section.findMany({
    where: { id: { in: sectionIds }, isActive: true },
    include: { class: { select: { name: true } } },
  });
  if (sections.length !== sectionIds.length)
    throw ApiError.badRequest("A selected section is missing or inactive");
  if (new Set(sections.map((s) => s.classId)).size > 1)
    throw ApiError.badRequest("Choose sections of one class");
  const classId = sections[0].classId;
  if (
    (await prisma.classSubject.count({
      where: { classId, subjectId: input.subjectId },
    })) === 0
  )
    throw ApiError.badRequest("That subject is not mapped to this class");

  const ctx = await ctxFor(user, input.sessionId);
  const assigned = await prisma.teacherAssignment.findMany({
    where: {
      sessionId: input.sessionId,
      subjectId: input.subjectId,
      sectionId: { in: sectionIds },
    },
    select: { sectionId: true, employeeId: true },
  });
  const teacherOf = new Map(assigned.map((a) => [a.sectionId, a.employeeId]));

  const plan = sections.map((s) => {
    let employeeId: string | null;
    if (ctx.scope) {
      if (!ctx.employeeId || teacherOf.get(s.id) !== ctx.employeeId)
        throw ApiError.forbidden(
          `You are not assigned to teach this subject in ${s.class.name} ${s.name}`,
        );
      employeeId = ctx.employeeId;
    } else employeeId = input.employeeId ?? teacherOf.get(s.id) ?? null;
    if (!employeeId)
      throw ApiError.badRequest(
        `No teacher is assigned to this subject in ${s.class.name} ${s.name}. Choose a teacher.`,
      );
    return { sectionId: s.id, employeeId };
  });
  const teacherIds = [...new Set(plan.map((p) => p.employeeId))];
  if (
    (await prisma.employee.count({
      where: { id: { in: teacherIds }, isTeacher: true, status: "ACTIVE" },
    })) !== teacherIds.length
  )
    throw ApiError.badRequest(
      "Only active teachers can be responsible for homework",
    );

  const checked = checkFiles(files);
  const savedAll: string[] = [];
  const created: { id: string; homeworkNo: string }[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      for (const p of plan) {
        const saved = await storeAll(HOMEWORK_ROOT, checked); // each homework owns its own copy, so one can change without touching the others
        savedAll.push(...saved.map((s) => s.stored));
        created.push(
          await tx.homework.create({
            data: {
              homeworkNo: await nextNo(tx, "HW", input.assignedOn),
              sessionId: input.sessionId,
              classId,
              sectionId: p.sectionId,
              subjectId: input.subjectId,
              employeeId: p.employeeId,
              title: input.title,
              description: input.description,
              assignedOn: input.assignedOn,
              dueDate: input.dueDate,
              maxMarks: input.maxMarks,
              allowLate: input.allowLate,
              createdById: user.id,
              attachments: { create: saved.map(fileRow) },
            },
            select: { id: true, homeworkNo: true },
          }),
        );
      }
    }, OPTS);
  } catch (e) {
    await Promise.all(savedAll.map((s) => removeFrom(HOMEWORK_ROOT, s)));
    throw e;
  }
  return { created };
}

export async function editHomework(
  user: User,
  id: string,
  input: HomeworkEdit,
) {
  const { hw } = await loadHw(user, id, "modify");
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("Cancelled homework cannot be changed");
  if (input.dueDate < hw.assignedOn)
    throw ApiError.badRequest("The due date is before the assigned date");
  const maxMarks = input.maxMarks ?? null;
  if (maxMarks !== null) {
    const over = await prisma.homeworkSubmission.count({
      where: { homeworkId: id, marks: { gt: maxMarks } },
    });
    if (over > 0)
      throw ApiError.conflict(
        `${over} student(s) already have marks above ${maxMarks}. Change those first.`,
      );
  } else if (
    (await prisma.homeworkSubmission.count({
      where: { homeworkId: id, marks: { not: null } },
    })) > 0
  )
    throw ApiError.conflict(
      "Marks have been given, so the maximum marks cannot be removed",
    );

  await prisma.$transaction(async (tx) => {
    await tx.homework.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate,
        maxMarks,
        allowLate: input.allowLate,
      },
    });
    // A new due date changes which submissions count as late.
    const subs = await tx.homeworkSubmission.findMany({
      where: { homeworkId: id },
      select: { id: true, submittedAt: true, late: true },
    });
    for (const s of subs) {
      const late = isLate(input.dueDate, s.submittedAt);
      if (late !== s.late)
        await tx.homeworkSubmission.update({
          where: { id: s.id },
          data: { late },
        });
    }
  }, OPTS);
  return { id };
}

export async function cancelHomework(user: User, id: string, reason: string) {
  const { hw } = await loadHw(user, id, "modify");
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("This homework is already cancelled");
  await prisma.homework.update({
    where: { id },
    data: { status: "CANCELLED", cancelReason: reason },
  });
  return { id };
}

export async function addAttachments(user: User, id: string, files: File[]) {
  const { hw } = await loadHw(user, id, "modify");
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("Cancelled homework cannot be changed");
  if (files.length === 0) throw ApiError.badRequest("Choose at least one file");
  if (hw.attachments.length + files.length > MAX_ATTACHMENTS)
    throw ApiError.badRequest(
      `A homework can have at most ${MAX_ATTACHMENTS} attachments`,
    );
  const saved = await storeAll(HOMEWORK_ROOT, checkFiles(files));
  try {
    await prisma.homeworkAttachment.createMany({
      data: saved.map((s) => ({ homeworkId: id, ...fileRow(s) })),
    });
  } catch (e) {
    await Promise.all(saved.map((s) => removeFrom(HOMEWORK_ROOT, s.stored)));
    throw e;
  }
  return { added: saved.length };
}

export async function removeAttachment(user: User, attachmentId: string) {
  const a = await prisma.homeworkAttachment.findUnique({
    where: { id: attachmentId },
  });
  if (!a) throw ApiError.notFound("Attachment not found");
  const { hw } = await loadHw(user, a.homeworkId, "modify");
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("Cancelled homework cannot be changed");
  await prisma.homeworkAttachment.delete({ where: { id: a.id } });
  await removeFrom(HOMEWORK_ROOT, a.storedName);
  return { id: a.id };
}

// ---------------- Files ----------------
export async function attachmentFile(user: User, id: string) {
  const a = await prisma.homeworkAttachment.findUnique({ where: { id } });
  if (!a) throw ApiError.notFound("File not found");
  await loadHw(user, a.homeworkId, "view");
  return {
    path: pathIn(HOMEWORK_ROOT, a.storedName),
    name: a.fileName,
    mime: a.mimeType,
  };
}
export async function submissionFile(user: User, id: string) {
  const f = await prisma.submissionFile.findUnique({
    where: { id },
    include: { submission: { select: { homeworkId: true } } },
  });
  if (!f) throw ApiError.notFound("File not found");
  await loadHw(user, f.submission.homeworkId, "view");
  return {
    path: pathIn(SUBMISSION_ROOT, f.storedName),
    name: f.fileName,
    mime: f.mimeType,
  };
}

// ---------------- Teacher: record, review, reset ----------------
async function enrolledIn(
  hw: { sessionId: string; sectionId: string },
  studentId: string,
) {
  const e = await prisma.enrollment.findFirst({
    where: {
      studentId,
      sessionId: hw.sessionId,
      sectionId: hw.sectionId,
      status: "ENROLLED",
    },
    select: { id: true },
  });
  if (!e)
    throw ApiError.badRequest("This student is not in the homework's section");
}

export async function recordSubmission(
  user: User,
  id: string,
  studentId: string,
  input: { note?: string; submittedOn?: Date },
  files: File[],
) {
  const { hw } = await loadHw(user, id, "modify");
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("Cancelled homework cannot take submissions");
  await enrolledIn(hw, studentId);
  if (!input.note && files.length === 0)
    throw ApiError.badRequest("Add a note or attach a file");
  const today = todayUtc();
  const on = input.submittedOn ?? today;
  if (on > today) throw ApiError.badRequest("The date cannot be in the future");
  if (on < hw.assignedOn)
    throw ApiError.badRequest("The date is before the homework was assigned");
  if (
    await prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId: id, studentId } },
    })
  )
    throw ApiError.conflict("This student already has a submission");

  const saved = await storeAll(SUBMISSION_ROOT, checkFiles(files));
  try {
    const row = await prisma.homeworkSubmission.create({
      data: {
        homeworkId: id,
        studentId,
        note: input.note,
        submittedAt: new Date(`${iso(on)}T12:00:00Z`),
        late: isLate(hw.dueDate, on),
        onBehalf: true,
        submittedById: user.id,
        files: { create: saved.map(fileRow) },
      },
      select: { id: true, late: true },
    });
    return row;
  } catch (e) {
    await Promise.all(saved.map((s) => removeFrom(SUBMISSION_ROOT, s.stored)));
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw ApiError.conflict("This student already has a submission");
    throw e;
  }
}

export async function reviewSubmission(
  user: User,
  id: string,
  studentId: string,
  input: ReviewInput,
) {
  const { hw } = await loadHw(user, id, "modify");
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("Cancelled homework cannot be reviewed");
  const sub = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: id, studentId } },
  });
  if (!sub) throw ApiError.notFound("This student has not submitted yet");
  const marks = input.marks ?? null;
  if (marks !== null) {
    if (hw.maxMarks === null)
      throw ApiError.badRequest(
        "This homework has no marks. Set maximum marks first.",
      );
    if (marks > hw.maxMarks)
      throw ApiError.badRequest(`Marks cannot be more than ${hw.maxMarks}`);
    if (Math.abs(marks * 100 - Math.round(marks * 100)) > 1e-6)
      throw ApiError.badRequest("Marks can have at most 2 decimal places");
  }
  await prisma.homeworkSubmission.update({
    where: { id: sub.id },
    data: {
      status: input.status,
      marks: input.status === "CHECKED" ? marks : null,
      feedback: input.feedback ?? null,
      checkedById: user.id,
      checkedAt: new Date(),
    },
  });
  return { id: sub.id, status: input.status };
}

export async function resetSubmission(
  user: User,
  id: string,
  studentId: string,
) {
  const { hw } = await loadHw(user, id, "modify");
  const sub = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: id, studentId } },
    include: { files: true },
  });
  if (!sub) throw ApiError.notFound("There is no submission to remove");
  if (!sub.onBehalf || sub.status !== "SUBMITTED")
    throw ApiError.conflict(
      "Only a submission you recorded, that is not yet checked, can be removed",
    );
  if (hw.status !== "ACTIVE")
    throw ApiError.conflict("Cancelled homework cannot be changed");
  await prisma.homeworkSubmission.delete({ where: { id: sub.id } }); // files go with it
  await Promise.all(
    sub.files.map((f) => removeFrom(SUBMISSION_ROOT, f.storedName)),
  );
  return { id: sub.id };
}

// ---------------- Portal: students and parents ----------------
/** The students this login may act for: itself (a student login) or its linked children (a parent login). */
export async function childrenOf(userId: string) {
  const [self, linked] = await Promise.all([
    prisma.student.findMany({
      where: { userId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    }),
    prisma.studentGuardian.findMany({
      where: {
        guardian: { userId },
        student: { status: "ACTIVE", archivedAt: null },
      },
      select: { studentId: true },
    }),
  ]);
  const ids = [
    ...new Set([...self.map((s) => s.id), ...linked.map((l) => l.studentId)]),
  ];
  if (ids.length === 0) return [];
  const sessionId = await activeSessionId();
  const rows = await prisma.enrollment.findMany({
    where: {
      studentId: { in: ids },
      sessionId: sessionId ?? "__none__",
      status: "ENROLLED",
    },
    include: {
      student: { select: { fullName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  });
  return rows.map((e) => ({
    studentId: e.studentId,
    sessionId: e.sessionId,
    classId: e.classId,
    sectionId: e.sectionId,
    fullName: e.student.fullName,
    className: e.class.name,
    sectionName: e.section.name,
    rollNo: e.rollNo,
  }));
}
async function child(userId: string, studentId: string) {
  const c = (await childrenOf(userId)).find((x) => x.studentId === studentId);
  if (!c)
    throw ApiError.forbidden("This student is not linked to your account");
  return c;
}
async function portalHw(c: Awaited<ReturnType<typeof child>>, id: string) {
  const hw = await prisma.homework.findFirst({
    where: {
      id,
      sessionId: c.sessionId,
      sectionId: c.sectionId,
      status: "ACTIVE",
    },
    include: {
      subject: { select: { name: true } },
      employee: { select: { fullName: true } },
      attachments: true,
    },
  });
  if (!hw) throw ApiError.notFound("Homework not found");
  return hw;
}

export async function portalList(user: User, studentId: string) {
  const c = await child(user.id, studentId);
  const rows = await prisma.homework.findMany({
    where: { sessionId: c.sessionId, sectionId: c.sectionId, status: "ACTIVE" },
    orderBy: [{ dueDate: "desc" }],
    take: 200,
    include: {
      subject: { select: { name: true } },
      employee: { select: { fullName: true } },
      _count: { select: { attachments: true } },
      submissions: {
        where: { studentId },
        select: { status: true, late: true, marks: true },
      },
    },
  });
  const today = todayUtc();
  return rows.map((r) => {
    const s = r.submissions[0] ?? null;
    return {
      id: r.id,
      homeworkNo: r.homeworkNo,
      title: r.title,
      subject: r.subject.name,
      teacher: r.employee.fullName,
      assignedOn: r.assignedOn,
      dueDate: r.dueDate,
      maxMarks: r.maxMarks,
      attachments: r._count.attachments,
      track: trackOf(s, r.dueDate, today),
      marks: s?.marks == null ? null : Number(s.marks),
    };
  });
}

export async function portalDetail(user: User, id: string, studentId: string) {
  const c = await child(user.id, studentId);
  const hw = await portalHw(c, id);
  const sub = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: id, studentId } },
    include: { files: true },
  });
  const today = todayUtc();
  return {
    id: hw.id,
    homeworkNo: hw.homeworkNo,
    title: hw.title,
    description: hw.description,
    subject: hw.subject.name,
    teacher: hw.employee.fullName,
    assignedOn: hw.assignedOn,
    dueDate: hw.dueDate,
    maxMarks: hw.maxMarks,
    allowLate: hw.allowLate,
    attachments: hw.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
    })),
    track: trackOf(sub, hw.dueDate, today),
    submission: sub ? subShape(sub) : null,
    cannotSubmitBecause: canSubmit(hw, sub, today),
  };
}

export async function portalSubmit(
  user: User,
  id: string,
  studentId: string,
  note: string | undefined,
  files: File[],
) {
  const c = await child(user.id, studentId);
  const hw = await portalHw(c, id);
  const existing = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: id, studentId } },
    include: { files: true },
  });
  const today = todayUtc();
  const blocked = canSubmit(hw, existing, today);
  if (blocked) throw ApiError.conflict(blocked);
  if (!note && files.length === 0)
    throw ApiError.badRequest("Add a note or attach a file");

  const saved = await storeAll(SUBMISSION_ROOT, checkFiles(files));
  try {
    const row = await prisma.$transaction(async (tx) => {
      const data = {
        status: "SUBMITTED" as const,
        note: note ?? null,
        submittedAt: new Date(),
        late: isLate(hw.dueDate, today),
        onBehalf: false,
        submittedById: user.id,
      };
      const s = existing
        ? await tx.homeworkSubmission.update({
            where: { id: existing.id },
            data,
          })
        : await tx.homeworkSubmission.create({
            data: { homeworkId: id, studentId, ...data },
          });
      if (existing)
        await tx.submissionFile.deleteMany({
          where: { submissionId: existing.id },
        }); // a resubmission replaces the earlier files
      if (saved.length)
        await tx.submissionFile.createMany({
          data: saved.map((x) => ({ submissionId: s.id, ...fileRow(x) })),
        });
      return s;
    }, OPTS);
    if (existing)
      await Promise.all(
        existing.files.map((f) => removeFrom(SUBMISSION_ROOT, f.storedName)),
      );
    return { id: row.id, late: row.late };
  } catch (e) {
    await Promise.all(saved.map((s) => removeFrom(SUBMISSION_ROOT, s.stored)));
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw ApiError.conflict(
        "This homework was just submitted. Reload and try again.",
      );
    throw e;
  }
}

export async function portalAttachment(
  user: User,
  attachmentId: string,
  studentId: string,
) {
  const c = await child(user.id, studentId);
  const a = await prisma.homeworkAttachment.findUnique({
    where: { id: attachmentId },
  });
  if (!a) throw ApiError.notFound("File not found");
  await portalHw(c, a.homeworkId);
  return {
    path: pathIn(HOMEWORK_ROOT, a.storedName),
    name: a.fileName,
    mime: a.mimeType,
  };
}
export async function portalSubmissionFile(
  user: User,
  fileId: string,
  studentId: string,
) {
  await child(user.id, studentId);
  const f = await prisma.submissionFile.findUnique({
    where: { id: fileId },
    include: { submission: { select: { studentId: true } } },
  });
  if (!f || f.submission.studentId !== studentId)
    throw ApiError.notFound("File not found"); // never another student's file
  return {
    path: pathIn(SUBMISSION_ROOT, f.storedName),
    name: f.fileName,
    mime: f.mimeType,
  };
}

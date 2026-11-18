import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type { SaveGrid } from "./marks.schema";
import { MarkStatus, validateEntry } from "./results.calc";

async function context(examId: string, classId: string, subjectId?: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { classes: true },
  });
  if (!exam) throw ApiError.notFound("Exam not found");
  const ec = exam.classes.find((c) => c.classId === classId);
  if (!ec) throw ApiError.badRequest("That class does not sit this exam");
  const paper = subjectId
    ? await prisma.examSubject.findUnique({
        where: { examId_classId_subjectId: { examId, classId, subjectId } },
        include: { subject: { select: { name: true } } },
      })
    : null;
  if (subjectId && !paper)
    throw ApiError.notFound(
      "That subject is not part of this exam for this class",
    );
  return { exam, ec, paper };
}

/** Why marks cannot change right now, or null when they can. */
export const lockReason = (
  exam: { status: string },
  ec: { resultsPublishedAt: Date | null },
) =>
  ec.resultsPublishedAt
    ? "Results for this class are published. An approver must unpublish them before marks can change."
    : exam.status === "DRAFT"
      ? "Marks can be entered once the exam is published."
      : null;

export const enrolledStudents = (sessionId: string, classId: string) =>
  prisma.enrollment.findMany({
    where: {
      sessionId,
      classId,
      status: "ENROLLED",
      student: { status: "ACTIVE", archivedAt: null },
    },
    orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
    include: {
      student: { select: { id: true, admissionNo: true, fullName: true } },
      section: { select: { name: true } },
    },
  });

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

export async function loadGrid(
  examId: string,
  classId: string,
  subjectId: string,
) {
  const { exam, ec, paper } = await context(examId, classId, subjectId);
  const students = await enrolledStudents(exam.sessionId, classId);
  const marks = await prisma.examMark.findMany({
    where: {
      examSubjectId: paper!.id,
      studentId: { in: students.map((s) => s.studentId) },
    },
  });
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));

  const rows = students.map((s) => {
    const m = byStudent.get(s.studentId);
    return {
      enrollmentId: s.id,
      studentId: s.studentId,
      rollNo: s.rollNo,
      admissionNo: s.student.admissionNo,
      fullName: s.student.fullName,
      section: s.section.name,
      mark: m
        ? {
            status: m.status,
            theory: num(m.theory),
            practical: num(m.practical),
            remarks: m.remarks,
          }
        : null,
    };
  });
  const count = (st: MarkStatus) =>
    rows.filter((r) => r.mark?.status === st).length;
  return {
    exam: { id: exam.id, name: exam.name, status: exam.status },
    paper: {
      subjectName: paper!.subject.name,
      totalMarks: paper!.totalMarks,
      practicalMarks: paper!.practicalMarks,
      passingMarks: paper!.passingMarks,
      theoryMax: paper!.totalMarks - paper!.practicalMarks,
    },
    locked: lockReason(exam, ec),
    students: rows,
    summary: {
      entered: count("ENTERED"),
      absent: count("ABSENT"),
      exempt: count("EXEMPT"),
      missing: rows.filter((r) => !r.mark).length,
    },
  };
}

/** How many students have a mark, absence or exemption in each paper. */
export async function progress(examId: string, classId: string) {
  const { exam, ec } = await context(examId, classId);
  const [papers, students] = await Promise.all([
    prisma.examSubject.findMany({
      where: { examId, classId },
      include: { subject: { select: { name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    enrolledStudents(exam.sessionId, classId),
  ]);
  const groups = await prisma.examMark.groupBy({
    by: ["examSubjectId", "status"],
    _count: { _all: true },
    where: {
      examSubject: { examId, classId },
      studentId: { in: students.map((s) => s.studentId) },
    },
  });
  const n = (id: string, st: MarkStatus) =>
    groups.find((g) => g.examSubjectId === id && g.status === st)?._count
      ._all ?? 0;
  return {
    expected: students.length,
    published: !!ec.resultsPublishedAt,
    locked: lockReason(exam, ec),
    papers: papers.map((p) => {
      const entered = n(p.id, "ENTERED"),
        absent = n(p.id, "ABSENT"),
        exempt = n(p.id, "EXEMPT");
      return {
        subjectId: p.subjectId,
        subjectName: p.subject.name,
        entered,
        absent,
        exempt,
        missing: students.length - entered - absent - exempt,
      };
    }),
  };
}

export async function saveGrid(
  input: SaveGrid,
  who: { id: string; canEdit: boolean },
) {
  const { exam, ec, paper } = await context(
    input.examId,
    input.classId,
    input.subjectId,
  );
  const reason = lockReason(exam, ec);
  if (reason) throw ApiError.conflict(reason);

  const students = await enrolledStudents(exam.sessionId, input.classId);
  const known = new Map(students.map((s) => [s.id, s]));
  if (input.entries.some((e) => !known.has(e.enrollmentId)))
    throw ApiError.badRequest(
      "Some students are not enrolled in this class. Reload the grid and try again.",
    );

  const problems = input.entries
    .map((e) => ({
      name: known.get(e.enrollmentId)!.student.fullName,
      message: validateEntry(paper!, e),
    }))
    .filter((p) => p.message);
  if (problems.length)
    throw new ApiError(400, "Some marks are not valid. Nothing was saved.", {
      errors: problems,
    });

  const existing = await prisma.examMark.findMany({
    where: {
      examSubjectId: paper!.id,
      studentId: { in: students.map((s) => s.studentId) },
    },
  });
  const byStudent = new Map(existing.map((m) => [m.studentId, m]));

  const creates: Prisma.ExamMarkCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.ExamMarkUpdateInput }[] = [];
  const clears: string[] = [];
  let unchanged = 0;

  for (const e of input.entries) {
    const s = known.get(e.enrollmentId)!;
    const ex = byStudent.get(s.studentId);
    if (e.status === null) {
      if (ex) clears.push(ex.id);
      else unchanged++;
      continue;
    }

    const theoryMax = paper!.totalMarks - paper!.practicalMarks;
    const theory =
      e.status === "ENTERED"
        ? (e.theory ?? (theoryMax === 0 ? 0 : null))
        : null;
    const practical =
      e.status === "ENTERED" && paper!.practicalMarks > 0
        ? (e.practical ?? null)
        : null;
    const remarks = e.remarks ?? null;

    if (!ex) {
      creates.push({
        examSubjectId: paper!.id,
        enrollmentId: s.id,
        studentId: s.studentId,
        status: e.status,
        theory,
        practical,
        remarks,
        enteredById: who.id,
      });
    } else if (
      ex.status !== e.status ||
      num(ex.theory) !== theory ||
      num(ex.practical) !== practical ||
      (ex.remarks ?? null) !== remarks
    ) {
      updates.push({
        id: ex.id,
        data: {
          status: e.status,
          theory,
          practical,
          remarks,
          updatedById: who.id,
          enrollment: { connect: { id: s.id } },
        },
      });
    } else unchanged++;
  }

  if ((updates.length > 0 || clears.length > 0) && !who.canEdit) {
    throw ApiError.forbidden(
      `Marks for ${updates.length + clears.length} student(s) were already saved. You do not have permission to change saved marks.`,
    );
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        if (creates.length) await tx.examMark.createMany({ data: creates });
        for (const u of updates)
          await tx.examMark.update({ where: { id: u.id }, data: u.data });
        if (clears.length)
          await tx.examMark.deleteMany({ where: { id: { in: clears } } });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw ApiError.conflict(
        "Marks for some of these students were just saved by someone else. Reload the grid.",
      );
    }
    throw e;
  }
  return {
    created: creates.length,
    updated: updates.length,
    cleared: clears.length,
    unchanged,
  };
}

// ---------------- Excel ----------------
export async function exportGrid(
  examId: string,
  classId: string,
  subjectId: string,
) {
  const g = await loadGrid(examId, classId, subjectId);
  const hasPractical = g.paper.practicalMarks > 0;
  const columns = [
    { header: "Admission no", key: "adm", width: 16 },
    { header: "Student", key: "student", width: 28 },
    { header: "Roll no", key: "roll", width: 9 },
    {
      header: hasPractical
        ? `Theory (out of ${g.paper.theoryMax})`
        : `Marks (out of ${g.paper.totalMarks})`,
      key: "theory",
      width: 20,
    },
    ...(hasPractical
      ? [
          {
            header: `Practical (out of ${g.paper.practicalMarks})`,
            key: "practical",
            width: 22,
          },
        ]
      : []),
    { header: "Status", key: "status", width: 12 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];
  const rows = g.students.map((s) => ({
    adm: s.admissionNo,
    student: s.fullName,
    roll: s.rollNo ?? "",
    theory: s.mark?.status === "ENTERED" ? (s.mark.theory ?? "") : "",
    practical: s.mark?.status === "ENTERED" ? (s.mark.practical ?? "") : "",
    status:
      s.mark?.status === "ABSENT"
        ? "ABSENT"
        : s.mark?.status === "EXEMPT"
          ? "EXEMPT"
          : "",
    remarks: s.mark?.remarks ?? "",
  }));
  return {
    filename: `marks-${g.exam.name}-${g.paper.subjectName}`.replace(
      /[^\w.-]+/g,
      "-",
    ),
    sheet: g.paper.subjectName,
    columns,
    rows,
  };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  const o = v as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (o instanceof Date) return o.toISOString().slice(0, 10);
  if (typeof o === "object") {
    if ("result" in o && o.result !== undefined) return cellText(o.result);
    if ("richText" in o)
      return o.richText
        .map((r: { text: string }) => r.text)
        .join("")
        .trim();
    if ("text" in o) return String(o.text).trim();
    return "";
  }
  return String(o).trim();
}

/** Reads a filled sheet and returns the entries to load into the grid. Nothing is saved here. */
export async function parseImport(
  buffer: Buffer,
  examId: string,
  classId: string,
  subjectId: string,
) {
  const g = await loadGrid(examId, classId, subjectId);
  const byAdmission = new Map(
    g.students.map((s) => [s.admissionNo.toLowerCase(), s]),
  );

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw ApiError.badRequest(
      "That file could not be read. Use the Excel file exported from this page.",
    );
  }
  const ws = wb.worksheets[0];
  if (!ws) throw ApiError.badRequest("The workbook has no sheets");

  const col: Record<
    "adm" | "theory" | "practical" | "status" | "remarks",
    number | undefined
  > = {
    adm: undefined,
    theory: undefined,
    practical: undefined,
    status: undefined,
    remarks: undefined,
  };
  let headerRow = 0;
  for (let r = 1; r <= Math.min(5, ws.rowCount) && !headerRow; r++) {
    ws.getRow(r).eachCell((cell, c) => {
      const t = cellText(cell.value).toLowerCase();
      if (/^adm/.test(t)) col.adm = c;
      else if (/^(theory|marks)/.test(t)) col.theory = c;
      else if (/^practical/.test(t)) col.practical = c;
      else if (/^status/.test(t)) col.status = c;
      else if (/^remark/.test(t)) col.remarks = c;
    });
    if (col.adm) headerRow = r;
  }
  if (!headerRow)
    throw ApiError.badRequest(
      'The "Admission no" column was not found. Use the Excel file exported from this page.',
    );

  const entries: {
    enrollmentId: string;
    status: MarkStatus | null;
    theory?: number;
    practical?: number;
    remarks?: string;
  }[] = [];
  const errors: { row: number; admissionNo: string; message: string }[] = [];
  let rowsRead = 0;
  const read = (row: ExcelJS.Row, c?: number) =>
    c ? cellText(row.getCell(c).value) : "";

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const adm = read(row, col.adm);
    if (!adm) continue;
    rowsRead++;
    const s = byAdmission.get(adm.toLowerCase());
    const fail = (message: string) =>
      errors.push({ row: r, admissionNo: adm, message });
    if (!s) {
      fail("This admission number is not in this class");
      continue;
    }

    const statusText = read(row, col.status).toUpperCase();
    const theoryText = read(row, col.theory);
    const practicalText = read(row, col.practical);
    const remarks = read(row, col.remarks) || undefined;

    let status: MarkStatus | null;
    if (["ABSENT", "ABS", "A"].includes(statusText)) status = "ABSENT";
    else if (["EXEMPT", "EX", "E"].includes(statusText)) status = "EXEMPT";
    else if (statusText === "")
      status = theoryText !== "" || practicalText !== "" ? "ENTERED" : null;
    else {
      fail(
        `Unknown status "${statusText}". Use ABSENT, EXEMPT or leave it empty.`,
      );
      continue;
    }

    const theory = theoryText === "" ? undefined : Number(theoryText);
    const practical = practicalText === "" ? undefined : Number(practicalText);
    if (
      (theory !== undefined && isNaN(theory)) ||
      (practical !== undefined && isNaN(practical))
    ) {
      fail("Marks must be numbers");
      continue;
    }

    const message = validateEntry(g.paper, { status, theory, practical });
    if (message) {
      fail(message);
      continue;
    }
    entries.push({
      enrollmentId: s.enrollmentId,
      status,
      theory,
      practical,
      remarks,
    });
  }
  return { entries, errors, rowsRead };
}

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  addStatus,
  attendancePercent,
  emptyCounts,
  recorded,
} from "../attendance/attendance.calc";
import { buildCards } from "../exams/reportcards.service";
import { studentDues } from "../fees/payments.service";
import { nextNo } from "../finance/finance.service";
import { leaveDays } from "../leaves/leave.calc";
import type { LeaveInput } from "../leaves/leaves.schema";
import { borrowerSummary } from "../library/library.service";
import { getSetup } from "../timetable/timetable.service";

const OPTS = { timeout: 30_000, maxWait: 10_000 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(iso(new Date()));
const f2 = (d: Prisma.Decimal) => d.toFixed(2);

export interface Child {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  photoUrl: string | null;
  enrollment: null | {
    id: string;
    sessionId: string;
    classId: string;
    sectionId: string;
    rollNo: number | null;
    className: string;
    sectionName: string;
  };
}

// ---------------- Who is this login allowed to see? ----------------
/** The students this login may see: itself (a student login) or its linked children (a parent login). */
export async function linkedStudents(userId: string): Promise<Child[]> {
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

  const session = await prisma.academicSession.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  const rows = await prisma.student.findMany({
    where: { id: { in: ids } },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      admissionNo: true,
      fullName: true,
      fatherName: true,
      photoUrl: true,
      enrollments: {
        where: session
          ? { sessionId: session.id, status: "ENROLLED" }
          : { id: "__none__" },
        take: 1,
        select: {
          id: true,
          sessionId: true,
          classId: true,
          sectionId: true,
          rollNo: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((s) => {
    const e = s.enrollments[0];
    return {
      id: s.id,
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      fatherName: s.fatherName,
      photoUrl: s.photoUrl,
      enrollment: e
        ? {
            id: e.id,
            sessionId: e.sessionId,
            classId: e.classId,
            sectionId: e.sectionId,
            rollNo: e.rollNo,
            className: e.class.name,
            sectionName: e.section.name,
          }
        : null,
    };
  });
}

/** Throws unless the student belongs to this login. Every portal route goes through this. */
export async function assertChild(
  userId: string,
  studentId: string,
): Promise<Child> {
  const c = (await linkedStudents(userId)).find((x) => x.id === studentId);
  if (!c)
    throw ApiError.forbidden("This student is not linked to your account");
  return c;
}

// ---------------- Overview ----------------
export async function overviewFor(child: Child) {
  const today = todayUtc();
  const enr = child.enrollment;

  const counts = emptyCounts();
  if (enr) {
    const grouped = await prisma.studentAttendance.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { studentId: child.id, sessionId: enr.sessionId },
    });
    grouped.forEach((g) => addStatus(counts, g.status, g._count._all));
  }

  const [
    todayRow,
    dues,
    loans,
    unpaidFines,
    homeworkDue,
    latest,
    pendingLeaves,
    nextPaper,
  ] = await Promise.all([
    prisma.studentAttendance.findUnique({
      where: { studentId_date: { studentId: child.id, date: today } },
      select: { status: true },
    }),
    studentDues(child.id),
    prisma.libraryIssue.findMany({
      where: { studentId: child.id, status: "ISSUED" },
      select: { dueDate: true },
    }),
    prisma.libraryFine.aggregate({
      _sum: { amount: true },
      where: { studentId: child.id, status: "UNPAID" },
    }),
    enr
      ? prisma.homework.count({
          where: {
            sessionId: enr.sessionId,
            sectionId: enr.sectionId,
            status: "ACTIVE",
            dueDate: { gte: today },
            submissions: { none: { studentId: child.id } },
          },
        })
      : Promise.resolve(0),
    prisma.examResult.findFirst({
      where: { studentId: child.id },
      orderBy: { publishedAt: "desc" },
      include: { exam: { select: { id: true, name: true } } },
    }),
    prisma.leaveApplication.count({
      where: {
        applicantType: "STUDENT",
        studentId: child.id,
        status: "PENDING",
      },
    }),
    enr
      ? prisma.examSubject.findFirst({
          where: {
            classId: enr.classId,
            examDate: { gte: today },
            exam: { sessionId: enr.sessionId },
          },
          orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
          include: {
            subject: { select: { name: true } },
            exam: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    attendance: {
      today: todayRow?.status ?? null,
      percent: attendancePercent(counts),
      recorded: recorded(counts),
      ...counts,
    },
    fees: { totalDue: dues.totalDue, credit: dues.creditBalance },
    library: {
      out: loans.length,
      overdue: loans.filter((l) => l.dueDate < today).length,
      unpaidFines: f2(unpaidFines._sum.amount ?? new Prisma.Decimal(0)),
    },
    homeworkDue,
    pendingLeaves,
    latestResult: latest
      ? {
          examId: latest.exam.id,
          examName: latest.exam.name,
          percentage:
            latest.percentage === null ? null : Number(latest.percentage),
          grade: latest.grade,
          position: latest.position,
          result: latest.result,
        }
      : null,
    nextPaper: nextPaper
      ? {
          examName: nextPaper.exam.name,
          subject: nextPaper.subject.name,
          date: nextPaper.examDate,
          startTime: nextPaper.startTime,
          room: nextPaper.room,
        }
      : null,
  };
}

// ---------------- Profile ----------------
export async function profileFor(child: Child) {
  const s = await prisma.student.findUnique({
    where: { id: child.id },
    select: {
      admissionNo: true,
      fullName: true,
      fatherName: true,
      motherName: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      admissionDate: true,
      permanentAddress: true,
      currentAddress: true,
      city: true,
      emergencyName: true,
      emergencyPhone: true,
      needsTransport: true,
      guardians: {
        orderBy: { isPrimary: "desc" },
        select: {
          relation: true,
          isPrimary: true,
          guardian: { select: { fullName: true, phone: true, email: true } },
        },
      },
      enrollments: {
        orderBy: { session: { startDate: "desc" } },
        select: {
          id: true,
          rollNo: true,
          status: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
          session: { select: { name: true } },
        },
      },
    },
  });
  if (!s) throw ApiError.notFound("Student not found");
  return {
    ...s,
    guardians: s.guardians.map((g) => ({
      relation: g.relation,
      isPrimary: g.isPrimary,
      ...g.guardian,
    })),
    enrollments: s.enrollments.map((e) => ({
      id: e.id,
      rollNo: e.rollNo,
      status: e.status,
      className: e.class.name,
      sectionName: e.section.name,
      session: e.session.name,
    })),
  };
}

// ---------------- Attendance ----------------
export async function attendanceFor(
  child: Child,
  month: string | undefined,
) {
  const m = month ?? iso(new Date()).slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 0));
  const rows = await prisma.studentAttendance.findMany({
    where: { studentId: child.id, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    select: { date: true, status: true, remarks: true },
  });
  const counts = emptyCounts();
  rows.forEach((r) => addStatus(counts, r.status));

  const sessionCounts = emptyCounts();
  if (child.enrollment) {
    const grouped = await prisma.studentAttendance.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { studentId: child.id, sessionId: child.enrollment.sessionId },
    });
    grouped.forEach((g) => addStatus(sessionCounts, g.status, g._count._all));
  }
  return {
    month: m,
    records: rows.map((r) => ({
      date: iso(r.date),
      status: r.status,
      remarks: r.remarks,
    })),
    monthSummary: {
      ...counts,
      recorded: recorded(counts),
      percent: attendancePercent(counts),
    },
    sessionSummary: {
      ...sessionCounts,
      recorded: recorded(sessionCounts),
      percent: attendancePercent(sessionCounts),
    },
  };
}

// ---------------- Fees ----------------
export async function feesFor(child: Child) {
  const [dues, invoices, payments] = await Promise.all([
    studentDues(child.id),
    prisma.feeInvoice.findMany({
      where: { studentId: child.id, status: { not: "CANCELLED" } },
      orderBy: [{ periodKey: "desc" }, { invoiceNo: "desc" }],
      take: 60,
      include: {
        items: { select: { description: true, amount: true, discount: true } },
      },
    }),
    prisma.feePayment.findMany({
      where: { studentId: child.id, kind: "PAYMENT" },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 60,
      include: {
        lines: { select: { method: true, amount: true } },
        allocations: {
          select: {
            amount: true,
            invoice: { select: { invoiceNo: true, periodKey: true } },
          },
        },
      },
    }),
  ]);
  const today = todayUtc();
  return {
    totalDue: dues.totalDue,
    credit: dues.creditBalance,
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      periodKey: i.periodKey,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      status: i.status,
      subtotal: f2(i.subtotal),
      discount: f2(i.discountTotal),
      fine: f2(i.fineAmount),
      total: f2(i.totalAmount),
      paid: f2(i.paidAmount),
      balance: f2(i.totalAmount.minus(i.paidAmount)),
      overdue:
        (i.status === "OPEN" || i.status === "PARTIAL") && i.dueDate < today,
      items: i.items.map((it) => ({
        description: it.description,
        amount: f2(it.amount),
        discount: f2(it.discount),
      })),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      paymentDate: p.paymentDate,
      status: p.status,
      total: f2(p.totalAmount),
      advance: f2(p.unallocatedAmount),
      methods: p.lines.map((l) => ({ method: l.method, amount: f2(l.amount) })),
      allocations: p.allocations.map((a) => ({
        invoiceNo: a.invoice.invoiceNo,
        periodKey: a.invoice.periodKey,
        amount: f2(a.amount),
      })),
    })),
  };
}

// ---------------- Results and report card ----------------
export async function resultsFor(child: Child) {
  const rows = await prisma.examResult.findMany({
    where: { studentId: child.id },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: {
      exam: {
        select: {
          id: true,
          name: true,
          type: true,
          startDate: true,
          endDate: true,
          session: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    examId: r.exam.id,
    examName: r.exam.name,
    examType: r.exam.type,
    session: r.exam.session.name,
    startDate: r.exam.startDate,
    endDate: r.exam.endDate,
    obtained: Number(r.totalObtained),
    max: Number(r.totalMax),
    percentage: r.percentage === null ? null : Number(r.percentage),
    grade: r.grade,
    gpa: r.gpa === null ? null : Number(r.gpa),
    result: r.result,
    position: r.position,
    publishedAt: r.publishedAt,
  }));
}

/** The same card the school prints, limited to this student's own published result. */
export async function reportCardFor(
  schoolId: string,
  child: Child,
  examId: string,
) {
  const r = await prisma.examResult.findUnique({
    where: { examId_studentId: { examId, studentId: child.id } },
    select: { classId: true },
  });
  if (!r) throw ApiError.notFound("No published result for this exam");
  return buildCards(schoolId, examId, r.classId, { studentId: child.id });
}

// ---------------- Timetable and exam schedule ----------------
export async function timetableFor(child: Child) {
  const enr = child.enrollment;
  if (!enr) return { workingDays: [], periods: [], entries: [] };
  const [setup, entries] = await Promise.all([
    getSetup(enr.sessionId),
    prisma.timetableEntry.findMany({
      where: { sessionId: enr.sessionId, sectionId: enr.sectionId },
      include: {
        subject: { select: { name: true } },
        employee: { select: { fullName: true } },
        room: { select: { name: true } },
      },
    }),
  ]);
  return {
    workingDays: setup.workingDays,
    periods: setup.periods,
    entries: entries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      subject: e.subject.name,
      teacher: e.employee?.fullName ?? null,
      room: e.room?.name ?? null,
    })),
  };
}

export async function examScheduleFor(child: Child) {
  const enr = child.enrollment;
  if (!enr) return [];
  const rows = await prisma.examSubject.findMany({
    where: {
      classId: enr.classId,
      examDate: { not: null },
      exam: { sessionId: enr.sessionId, endDate: { gte: todayUtc() } },
    },
    orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
    include: {
      subject: { select: { name: true } },
      exam: { select: { id: true, name: true, type: true, status: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    examId: p.exam.id,
    examName: p.exam.name,
    provisional: p.exam.status === "DRAFT",
    subject: p.subject.name,
    date: p.examDate,
    startTime: p.startTime,
    endTime: p.endTime,
    room: p.room,
    totalMarks: p.totalMarks,
  }));
}

// ---------------- Leave ----------------
export async function leavesFor(child: Child) {
  const rows = await prisma.leaveApplication.findMany({
    where: { applicantType: "STUDENT", studentId: child.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    applicationNo: r.applicationNo,
    leaveType: r.leaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.days,
    reason: r.reason,
    status: r.status,
    rejectionReason: r.rejectionReason,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt,
    canCancel: r.status === "PENDING",
  }));
}

export async function applyLeave(
  userId: string,
  child: Child,
  input: LeaveInput,
) {
  const clash = await prisma.leaveApplication.findFirst({
    where: {
      applicantType: "STUDENT",
      studentId: child.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
    select: { applicationNo: true },
  });
  if (clash)
    throw ApiError.conflict(
      `There is already a leave application (${clash.applicationNo}) covering some of these dates`,
    );
  return prisma.$transaction(
    async (tx) =>
      tx.leaveApplication.create({
        data: {
          applicationNo: await nextNo(tx, "LV", todayUtc()),
          applicantType: "STUDENT",
          studentId: child.id,
          leaveType: input.leaveType,
          startDate: input.startDate,
          endDate: input.endDate,
          days: leaveDays(input.startDate, input.endDate),
          reason: input.reason,
          submittedById: userId,
        },
        select: { id: true, applicationNo: true },
      }),
    OPTS,
  );
}

export async function cancelLeave(
  userId: string,
  child: Child,
  leaveId: string,
) {
  const r = await prisma.leaveApplication.findFirst({
    where: { id: leaveId, applicantType: "STUDENT", studentId: child.id },
  });
  if (!r) throw ApiError.notFound("Leave application not found");
  if (r.status !== "PENDING")
    throw ApiError.conflict(
      `This application is already ${r.status.toLowerCase()}`,
    );
  if (r.submittedById !== userId)
    throw ApiError.forbidden(
      "This application was entered by the school office. Ask the office to cancel it.",
    );
  await prisma.leaveApplication.update({
    where: { id: r.id },
    data: {
      status: "CANCELLED",
      cancelReason: "Cancelled from the portal",
      decidedById: userId,
      decidedAt: new Date(),
    },
  });
  return { id: r.id };
}

// ---------------- Library ----------------
export const libraryFor = (schoolId: string, child: Child) =>
  borrowerSummary(schoolId, "STUDENT", child.id);

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { Change, diffFields, tempPassword } from "./staff.calc";
import type {
  ClassTeachersInput,
  EmployeeInput,
  PayrollDetailsInput,
  StatusInput,
  TeachingInput,
} from "./staff.schema";

type Tx = Prisma.TransactionClient;
const OPTS = { timeout: 30_000, maxWait: 10_000 };
const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;
const label = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");

const log = (
  tx: Tx,
  employeeId: string,
  changes: Change[],
  by: string,
  note?: string,
) =>
  changes.length === 0
    ? Promise.resolve()
    : tx.employeeHistory.createMany({
        data: changes.map((c) => ({ employeeId, ...c, note, changedById: by })),
      });

async function nextEmployeeNo(tx: Tx) {
  const c = await tx.counter.upsert({
    where: { key: "EMP" },
    create: { key: "EMP", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `EMP-${String(c.value).padStart(4, "0")}`;
}

async function checkRefs(input: EmployeeInput, selfId?: string) {
  const des = await prisma.designation.findUnique({
    where: { id: input.designationId },
  });
  if (!des || !des.isActive)
    throw ApiError.badRequest("Choose an active designation");
  if (
    input.departmentId &&
    !(await prisma.department.findFirst({
      where: { id: input.departmentId, isActive: true },
    }))
  )
    throw ApiError.badRequest("Choose an active department");
  if (input.cnic) {
    const dup = await prisma.employee.findUnique({
      where: { cnic: input.cnic },
      select: { id: true, employeeNo: true },
    });
    if (dup && dup.id !== selfId)
      throw ApiError.conflict(
        `An employee with this CNIC already exists (${dup.employeeNo})`,
      );
  }
}

export async function createEmployee(input: EmployeeInput, userId: string) {
  await checkRefs(input);
  return prisma.$transaction(async (tx) => {
    const e = await tx.employee.create({
      data: { ...input, employeeNo: await nextEmployeeNo(tx) },
      select: { id: true, employeeNo: true },
    });
    await log(
      tx,
      e.id,
      [
        {
          field: "Record",
          oldValue: null,
          newValue: "Employee record created",
        },
      ],
      userId,
    );
    return e;
  }, OPTS);
}

export async function updateEmployee(
  id: string,
  input: EmployeeInput,
  userId: string,
) {
  const before = await prisma.employee.findUnique({
    where: { id },
    include: {
      designation: { select: { name: true } },
      department: { select: { name: true } },
    },
  });
  if (!before) throw ApiError.notFound("Employee not found");
  await checkRefs(input, id);

  if (before.isTeacher && !input.isTeacher) {
    const [a, b] = await Promise.all([
      prisma.classTeacherAssignment.count({ where: { employeeId: id } }),
      prisma.teacherAssignment.count({ where: { employeeId: id } }),
    ]);
    if (a + b > 0)
      throw ApiError.conflict(
        "This teacher still has class assignments. Remove them before changing the teaching flag.",
      );
  }

  return prisma.$transaction(async (tx) => {
    const after = await tx.employee.update({
      where: { id },
      data: input,
      include: {
        designation: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    const snap = (e: typeof before) => ({
      Designation: e.designation.name,
      Department: e.department?.name ?? null,
      "Employment type": label(e.employmentType),
      "Teaching staff": e.isTeacher ? "Yes" : "No",
      "Joining date": day(e.joiningDate),
    });
    await log(tx, id, diffFields(snap(before), snap(after)), userId);
    return { id };
  }, OPTS);
}

export async function changeStatus(
  id: string,
  input: StatusInput,
  userId: string,
) {
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) throw ApiError.notFound("Employee not found");
  if (e.status === input.status)
    throw ApiError.conflict(
      `This employee is already ${label(e.status).toLowerCase()}`,
    );
  const leaving =
    input.status === "ACTIVE"
      ? null
      : (input.leavingDate ?? new Date(new Date().toISOString().slice(0, 10)));
  if (leaving && leaving < e.joiningDate)
    throw ApiError.badRequest("The leaving date is before the joining date");

  return prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: { status: input.status, leavingDate: leaving },
    });
    await log(
      tx,
      id,
      [
        {
          field: "Status",
          oldValue: label(e.status),
          newValue: label(input.status),
        },
      ],
      userId,
      input.reason,
    );
    // Someone who has left can no longer sign in.
    if (e.userId && input.status !== "ACTIVE") {
      await tx.user.update({
        where: { id: e.userId },
        data: { isActive: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId: e.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return {
      id,
      status: input.status,
      accountDisabled: !!e.userId && input.status !== "ACTIVE",
    };
  }, OPTS);
}

export async function savePayrollDetails(
  id: string,
  input: PayrollDetailsInput,
  userId: string,
) {
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) throw ApiError.notFound("Employee not found");
  return prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: input });
    const changes: Change[] = [];
    if (
      input.basicSalary !== undefined &&
      Number(e.basicSalary ?? -1) !== input.basicSalary
    ) {
      changes.push({
        field: "Basic salary",
        oldValue: e.basicSalary ? e.basicSalary.toFixed(2) : null,
        newValue: input.basicSalary.toFixed(2),
      });
    }
    if (
      ["bankName", "accountTitle", "accountNo"].some(
        (k) =>
          (input as Record<string, unknown>)[k] !== undefined &&
          (input as Record<string, unknown>)[k] !==
            (e as Record<string, unknown>)[k],
      )
    ) {
      changes.push({
        field: "Bank details",
        oldValue: null,
        newValue: "Updated",
      });
    }
    await log(tx, id, changes, userId);
    return { id };
  }, OPTS);
}

// ---------------- Login accounts ----------------
export async function createAccount(
  id: string,
  input: { email: string; roleSlug: string },
  schoolId: string,
  byUserId: string,
) {
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) throw ApiError.notFound("Employee not found");
  if (e.status !== "ACTIVE")
    throw ApiError.conflict("Only active employees can have a login");
  if (e.userId) throw ApiError.conflict("This employee already has a login");
  if (await prisma.user.findUnique({ where: { email: input.email } }))
    throw ApiError.conflict("That email is already used by another account");
  const role = await prisma.role.findUnique({
    where: { schoolId_slug: { schoolId, slug: input.roleSlug } },
  });
  if (!role) throw ApiError.badRequest("That role does not exist");

  const temp = tempPassword();
  const passwordHash = await bcrypt.hash(temp, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId,
        email: input.email,
        fullName: e.fullName,
        phone: e.phone,
        passwordHash,
        mustChangePassword: true,
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await tx.employee.update({ where: { id }, data: { userId: user.id } });
    await log(
      tx,
      id,
      [
        {
          field: "Login account",
          oldValue: null,
          newValue: `Created (${input.email}, ${role.name})`,
        },
      ],
      byUserId,
    );
  }, OPTS);
  return { email: input.email, tempPassword: temp };
}

export async function resetPassword(id: string, byUserId: string) {
  const e = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!e) throw ApiError.notFound("Employee not found");
  if (!e.userId || !e.user)
    throw ApiError.conflict("This employee has no login");
  const temp = tempPassword();
  const passwordHash = await bcrypt.hash(temp, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: e.userId! },
      data: { passwordHash, mustChangePassword: true },
    });
    await tx.refreshToken.updateMany({
      where: { userId: e.userId!, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await log(
      tx,
      id,
      [{ field: "Login account", oldValue: null, newValue: "Password reset" }],
      byUserId,
    );
  }, OPTS);
  return { email: e.user.email, tempPassword: temp };
}

export async function setAccountActive(
  id: string,
  isActive: boolean,
  byUserId: string,
) {
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) throw ApiError.notFound("Employee not found");
  if (!e.userId) throw ApiError.conflict("This employee has no login");
  if (isActive && e.status !== "ACTIVE")
    throw ApiError.conflict("Reactivate the employee first");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: e.userId! }, data: { isActive } });
    if (!isActive)
      await tx.refreshToken.updateMany({
        where: { userId: e.userId!, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await log(
      tx,
      id,
      [
        {
          field: "Login account",
          oldValue: null,
          newValue: isActive ? "Switched on" : "Switched off",
        },
      ],
      byUserId,
    );
  }, OPTS);
  return { id, isActive };
}

// ---------------- Assignments ----------------
export async function getAssignments(sessionId: string, classId: string) {
  const [sections, mapped, ct, tt] = await Promise.all([
    prisma.section.findMany({
      where: { classId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.classSubject.findMany({
      where: { classId, subject: { isActive: true } },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    prisma.classTeacherAssignment.findMany({
      where: { sessionId, classId },
      select: { sectionId: true, employeeId: true },
    }),
    prisma.teacherAssignment.findMany({
      where: { sessionId, classId },
      select: { sectionId: true, subjectId: true, employeeId: true },
    }),
  ]);
  return {
    sections,
    subjects: mapped.map((m) => m.subject),
    classTeachers: ct,
    cells: tt,
  };
}

async function checkTeachers(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await prisma.employee.count({
    where: { id: { in: unique }, isTeacher: true, status: "ACTIVE" },
  });
  if (found !== unique.length)
    throw ApiError.badRequest("Only active teachers can be assigned");
}

async function checkSections(classId: string, sectionIds: string[]) {
  const n = await prisma.section.count({
    where: { id: { in: [...new Set(sectionIds)] }, classId },
  });
  if (n !== new Set(sectionIds).size)
    throw ApiError.badRequest("A section does not belong to this class");
}

export async function saveClassTeachers(input: ClassTeachersInput) {
  await checkSections(
    input.classId,
    input.cells.map((c) => c.sectionId),
  );
  await checkTeachers(
    input.cells.map((c) => c.employeeId).filter((x): x is string => !!x),
  );

  // One section per teacher per session, counting assignments in other classes.
  const all = await prisma.classTeacherAssignment.findMany({
    where: { sessionId: input.sessionId },
    select: { sectionId: true, employeeId: true },
  });
  const final = new Map(all.map((a) => [a.sectionId, a.employeeId]));
  input.cells.forEach((c) =>
    c.employeeId
      ? final.set(c.sectionId, c.employeeId)
      : final.delete(c.sectionId),
  );
  const perEmployee = new Map<string, number>();
  final.forEach((emp) => perEmployee.set(emp, (perEmployee.get(emp) ?? 0) + 1));
  const twice = [...perEmployee.entries()].find(([, n]) => n > 1);
  if (twice) {
    const emp = await prisma.employee.findUnique({
      where: { id: twice[0] },
      select: { fullName: true },
    });
    throw ApiError.conflict(
      `${emp?.fullName ?? "A teacher"} would be class teacher of more than one section. A teacher can be class teacher of one section per session.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const c of input.cells) {
      if (!c.employeeId)
        await tx.classTeacherAssignment.deleteMany({
          where: { sessionId: input.sessionId, sectionId: c.sectionId },
        });
      else
        await tx.classTeacherAssignment.upsert({
          where: {
            sessionId_sectionId: {
              sessionId: input.sessionId,
              sectionId: c.sectionId,
            },
          },
          create: {
            sessionId: input.sessionId,
            classId: input.classId,
            sectionId: c.sectionId,
            employeeId: c.employeeId,
          },
          update: { employeeId: c.employeeId },
        });
    }
  }, OPTS);
  return { saved: input.cells.length };
}

export async function saveTeaching(input: TeachingInput) {
  await checkSections(
    input.classId,
    input.cells.map((c) => c.sectionId),
  );
  await checkTeachers(
    input.cells.map((c) => c.employeeId).filter((x): x is string => !!x),
  );
  const subjects = [...new Set(input.cells.map((c) => c.subjectId))];
  const mapped = await prisma.classSubject.count({
    where: { classId: input.classId, subjectId: { in: subjects } },
  });
  if (mapped !== subjects.length)
    throw ApiError.badRequest("A subject is not mapped to this class");

  await prisma.$transaction(async (tx) => {
    for (const c of input.cells) {
      const where = {
        sessionId_sectionId_subjectId: {
          sessionId: input.sessionId,
          sectionId: c.sectionId,
          subjectId: c.subjectId,
        },
      };
      if (!c.employeeId)
        await tx.teacherAssignment.deleteMany({
          where: {
            sessionId: input.sessionId,
            sectionId: c.sectionId,
            subjectId: c.subjectId,
          },
        });
      else
        await tx.teacherAssignment.upsert({
          where,
          create: {
            sessionId: input.sessionId,
            classId: input.classId,
            sectionId: c.sectionId,
            subjectId: c.subjectId,
            employeeId: c.employeeId,
          },
          update: { employeeId: c.employeeId },
        });
    }
  }, OPTS);
  return { saved: input.cells.length };
}

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const TEACHER_ROLES = new Set(["teacher", "class-teacher"]);

/** Limited to their own classes only when every role the user holds is a teacher role. */
export const isScopedTeacher = (u: { roles: string[] }) =>
  u.roles.length > 0 && u.roles.every((r) => TEACHER_ROLES.has(r));

export interface TeacherScope {
  classTeacher: { classId: string; sectionId: string }[];
  teaching: { classId: string; sectionId: string; subjectId: string }[];
}

export async function loadScope(
  userId: string,
  sessionId: string,
): Promise<TeacherScope> {
  const emp = await prisma.employee.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!emp) return { classTeacher: [], teaching: [] };
  const [classTeacher, teaching] = await Promise.all([
    prisma.classTeacherAssignment.findMany({
      where: { sessionId, employeeId: emp.id },
      select: { classId: true, sectionId: true },
    }),
    prisma.teacherAssignment.findMany({
      where: { sessionId, employeeId: emp.id },
      select: { classId: true, sectionId: true, subjectId: true },
    }),
  ]);
  return { classTeacher, teaching };
}

/** null = unrestricted. Otherwise the teacher's assignments in that session. */
export async function scopeFor(
  user: { id: string; roles: string[] },
  sessionId: string,
): Promise<TeacherScope | null> {
  return isScopedTeacher(user) ? loadScope(user.id, sessionId) : null;
}

/** Enrollments a teacher may see: their class-teacher sections and the sections they teach. */
export function enrollmentScopeWhere(
  scope: TeacherScope,
): Prisma.EnrollmentWhereInput {
  const pairs = [
    ...scope.classTeacher,
    ...scope.teaching.map(({ classId, sectionId }) => ({ classId, sectionId })),
  ];
  if (pairs.length === 0) return { id: "__none__" };
  return {
    OR: pairs.map((p) => ({ classId: p.classId, sectionId: p.sectionId })),
  };
}

export const sectionsForSubject = (
  scope: TeacherScope,
  classId: string,
  subjectId: string,
) =>
  new Set(
    scope.teaching
      .filter((t) => t.classId === classId && t.subjectId === subjectId)
      .map((t) => t.sectionId),
  );

/** subjectId -> sections the teacher teaches it in, for one class. */
export function subjectSectionsInClass(scope: TeacherScope, classId: string) {
  const out = new Map<string, Set<string>>();
  scope.teaching
    .filter((t) => t.classId === classId)
    .forEach((t) => {
      const s = out.get(t.subjectId) ?? new Set<string>();
      s.add(t.sectionId);
      out.set(t.subjectId, s);
    });
  return out;
}

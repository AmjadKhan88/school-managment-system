import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { tempPassword } from "../staff/staff.calc";

export type Kind = "student" | "guardian";
const OPTS = { timeout: 30_000, maxWait: 10_000 };
/** The seeded role each kind of login receives. */
const ROLE_SLUG: Record<Kind, string> = { student: "student", guardian: "parent" };

interface Target {
  name: string;
  phone: string | null;
  userId: string | null;
  eligible: boolean;
  reason: string;
}

async function load(kind: Kind, id: string): Promise<Target> {
  if (kind === "student") {
    const s = await prisma.student.findUnique({
      where: { id },
      select: {
        fullName: true,
        status: true,
        archivedAt: true,
        userId: true,
      },
    });
    if (!s) throw ApiError.notFound("Student not found");
    return {
      name: s.fullName,
      phone: null,
      userId: s.userId,
      eligible: s.status === "ACTIVE" && !s.archivedAt,
      reason: "Only active students can have a login",
    };
  }
  const g = await prisma.guardian.findUnique({
    where: { id },
    select: { fullName: true, phone: true, userId: true },
  });
  if (!g) throw ApiError.notFound("Guardian not found");
  const active = await prisma.studentGuardian.count({
    where: {
      guardianId: id,
      student: { status: "ACTIVE", archivedAt: null },
    },
  });
  return {
    name: g.fullName,
    phone: g.phone,
    userId: g.userId,
    eligible: active > 0,
    reason: "This guardian has no active student",
  };
}

const accountShape = (
  u:
    | {
        email: string;
        isActive: boolean;
        mustChangePassword: boolean;
        lastLoginAt: Date | null;
      }
    | undefined,
) =>
  u
    ? {
        email: u.email,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt,
      }
    : null;

/** The logins of one student and of each guardian, for the student profile. */
export async function accountsFor(studentId: string) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      fullName: true,
      status: true,
      archivedAt: true,
      userId: true,
      guardians: {
        orderBy: { isPrimary: "desc" },
        select: {
          relation: true,
          isPrimary: true,
          guardian: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              userId: true,
            },
          },
        },
      },
    },
  });
  if (!s) throw ApiError.notFound("Student not found");
  const userIds = [s.userId, ...s.guardians.map((g) => g.guardian.userId)].filter(
    (x): x is string => !!x,
  );
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    student: {
      id: s.id,
      name: s.fullName,
      canHaveLogin: s.status === "ACTIVE" && !s.archivedAt,
      account: accountShape(s.userId ? byId.get(s.userId) : undefined),
    },
    guardians: s.guardians.map((g) => ({
      id: g.guardian.id,
      name: g.guardian.fullName,
      relation: g.relation,
      isPrimary: g.isPrimary,
      phone: g.guardian.phone,
      email: g.guardian.email,
      account: accountShape(
        g.guardian.userId ? byId.get(g.guardian.userId) : undefined,
      ),
    })),
  };
}

export async function createLogin(
  kind: Kind,
  id: string,
  email: string,
  schoolId: string,
) {
  const t = await load(kind, id);
  if (!t.eligible) throw ApiError.conflict(t.reason);
  if (t.userId) throw ApiError.conflict("This person already has a login");
  if (await prisma.user.findUnique({ where: { email } }))
    throw ApiError.conflict("That email is already used by another account");
  const role = await prisma.role.findUnique({
    where: { schoolId_slug: { schoolId, slug: ROLE_SLUG[kind] } },
  });
  if (!role)
    throw ApiError.badRequest(
      `The ${ROLE_SLUG[kind]} role is missing. Run the database seed first.`,
    );

  const temp = tempPassword();
  const passwordHash = await bcrypt.hash(temp, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId,
        email,
        fullName: t.name,
        phone: t.phone,
        passwordHash,
        mustChangePassword: true,
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    if (kind === "student")
      await tx.student.update({ where: { id }, data: { userId: user.id } });
    else await tx.guardian.update({ where: { id }, data: { userId: user.id } });
  }, OPTS);
  return { email, tempPassword: temp };
}

async function userOf(kind: Kind, id: string) {
  const t = await load(kind, id);
  if (!t.userId) throw ApiError.conflict("This person has no login");
  const user = await prisma.user.findUnique({
    where: { id: t.userId },
    select: { id: true, email: true },
  });
  if (!user) throw ApiError.conflict("This person has no login");
  return user;
}

export async function resetLogin(kind: Kind, id: string) {
  const user = await userOf(kind, id);
  const temp = tempPassword();
  const passwordHash = await bcrypt.hash(temp, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { email: user.email, tempPassword: temp };
}

export async function setLoginActive(
  kind: Kind,
  id: string,
  isActive: boolean,
) {
  const user = await userOf(kind, id);
  if (isActive) {
    const t = await load(kind, id);
    if (!t.eligible) throw ApiError.conflict(t.reason);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { isActive } }),
    ...(isActive
      ? []
      : [
          prisma.refreshToken.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]),
  ]);
  return { email: user.email, isActive };
}

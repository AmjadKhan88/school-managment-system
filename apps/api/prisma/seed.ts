import bcrypt from 'bcryptjs';
import { PermissionAction } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { env } from '../src/config/env';
import { DEFAULT_ROLES, PERMISSION_ACTIONS, PERMISSION_MODULES } from '../src/config/permissions';

async function main() {
  // 1. Permission catalogue
  for (const module of PERMISSION_MODULES)
    for (const action of PERMISSION_ACTIONS)
      await prisma.permission.upsert({
        where: { module_action: { module, action: action as PermissionAction } },
        update: {}, create: { module, action: action as PermissionAction },
      });
  const allPerms = await prisma.permission.findMany();

  // 2. School + main branch + active session
  const school = await prisma.school.upsert({
    where: { code: 'MAIN' }, update: {}, create: { name: env.SEED_SCHOOL_NAME, code: 'MAIN' },
  });
  await prisma.branch.upsert({
    where: { schoolId_code: { schoolId: school.id, code: 'MAIN' } },
    update: {}, create: { schoolId: school.id, code: 'MAIN', name: 'Main Campus', isMain: true },
  });
  const y = new Date().getFullYear();
  await prisma.academicSession.upsert({
    where: { schoolId_name: { schoolId: school.id, name: `${y}-${String(y + 1).slice(2)}` } },
    update: {},
    create: { schoolId: school.id, name: `${y}-${String(y + 1).slice(2)}`, startDate: new Date(`${y}-04-01`), endDate: new Date(`${y + 1}-03-31`), isActive: true },
  });

  // 3. Default roles + grants
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { schoolId_slug: { schoolId: school.id, slug: r.slug } },
      update: { name: r.name, description: r.description },
      create: { schoolId: school.id, slug: r.slug, name: r.name, description: r.description, isSystem: true },
    });
    const wanted = r.grants === '*' ? allPerms
      : allPerms.filter((p) => (r.grants as any)[p.module]?.includes(p.action));
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }

  // 4. First super admin
  const superRole = await prisma.role.findUniqueOrThrow({ where: { schoolId_slug: { schoolId: school.id, slug: 'super-admin' } } });
  const admin = await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL }, update: {},
    create: { schoolId: school.id, email: env.SEED_ADMIN_EMAIL, fullName: 'Super Administrator',
      passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12), mustChangePassword: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } }, update: {}, create: { userId: admin.id, roleId: superRole.id },
  });
  console.log(`Seed complete. Sign in with ${env.SEED_ADMIN_EMAIL}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

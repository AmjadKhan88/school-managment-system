import bcrypt from "bcryptjs";
import { PermissionAction } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { env } from "../src/config/env";
import {
  DEFAULT_ROLES,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
} from "../src/config/permissions";

async function main() {
  // 1. Permission catalogue
  for (const module of PERMISSION_MODULES)
    for (const action of PERMISSION_ACTIONS)
      await prisma.permission.upsert({
        where: {
          module_action: { module, action: action as PermissionAction },
        },
        update: {},
        create: { module, action: action as PermissionAction },
      });
  const allPerms = await prisma.permission.findMany();

  // 2. School + main branch + active session
  const school = await prisma.school.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { name: env.SEED_SCHOOL_NAME, code: "MAIN" },
  });
  await prisma.branch.upsert({
    where: { schoolId_code: { schoolId: school.id, code: "MAIN" } },
    update: {},
    create: {
      schoolId: school.id,
      code: "MAIN",
      name: "Main Campus",
      isMain: true,
    },
  });
  const y = new Date().getFullYear();
  const sessionName = `${y}-${String(y + 1).slice(2)}`;
  await prisma.academicSession.upsert({
    where: { schoolId_name: { schoolId: school.id, name: sessionName } },
    update: {},
    create: {
      schoolId: school.id,
      name: sessionName,
      startDate: new Date(`${y}-04-01`),
      endDate: new Date(`${y + 1}-03-31`),
      isActive: true,
    },
  });

  // 2b. Default fee categories
  const feeCategories: [string, string, "MONTHLY" | "ONE_TIME" | "YEARLY"][] = [
    ["Admission Fee", "ADM", "ONE_TIME"],
    ["Monthly Tuition Fee", "TUI", "MONTHLY"],
    ["Annual Charges", "ANN", "YEARLY"],
    ["Examination Fee", "EXM", "YEARLY"],
    ["Registration Fee", "REG", "ONE_TIME"],
    ["Computer Fee", "CMP", "MONTHLY"],
    ["Library Fee", "LIB", "YEARLY"],
    ["Laboratory Fee", "LAB", "YEARLY"],
    ["Transport Fee", "TRN", "MONTHLY"],
    ["Miscellaneous Fee", "MSC", "ONE_TIME"],
  ];
  for (const [i, [name, code, frequency]] of feeCategories.entries()) {
    await prisma.feeCategory.upsert({
      where: { code },
      update: {},
      create: { name, code, frequency, sortOrder: i + 1 },
    });
  }

  // 2c. Default expense categories
  const expenseCategories = [
    "Electricity",
    "Gas",
    "Water",
    "Rent",
    "Salaries",
    "Stationery",
    "Maintenance",
    "Internet",
    "Transport",
    "Other expenses",
  ];
  for (const [i, name] of expenseCategories.entries()) {
    await (prisma as any).expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: i + 1 },
    });
  }

  // 3. Default roles + grants
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { schoolId_slug: { schoolId: school.id, slug: r.slug } },
      update: { name: r.name, description: r.description },
      create: {
        schoolId: school.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        isSystem: true,
      },
    });
    const wanted =
      r.grants === "*"
        ? allPerms
        : allPerms.filter((p) =>
            (r.grants as any)[p.module]?.includes(p.action),
          );
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  // 4. First super admin
  const superRole = await prisma.role.findUniqueOrThrow({
    where: { schoolId_slug: { schoolId: school.id, slug: "super-admin" } },
  });
  const admin = await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    update: {},
    create: {
      schoolId: school.id,
      email: env.SEED_ADMIN_EMAIL,
      fullName: "Super Administrator",
      passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12),
      mustChangePassword: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superRole.id },
  });
  console.log(`Seed complete. Sign in with ${env.SEED_ADMIN_EMAIL}`);
}

async function seedGradingScale() {
  // 2d. Default grading scale (editable later in the app)
  if ((await prisma.gradingScale.count()) === 0) {
    const bands: [string, number, number, string][] = [
      ["A+", 90, 4.0, "Outstanding"],
      ["A", 80, 3.7, "Excellent"],
      ["B", 70, 3.0, "Very good"],
      ["C", 60, 2.0, "Good"],
      ["D", 50, 1.0, "Satisfactory"],
      ["E", 40, 0.5, "Needs improvement"],
      ["F", 0, 0.0, "Fail"],
    ];
    await prisma.gradingScale.create({
      data: {
        name: "Standard",
        isDefault: true,
        bands: {
          create: bands.map(([grade, minPercent, gradePoint, remark]) => ({
            grade,
            minPercent,
            gradePoint,
            remark,
          })),
        },
      },
    });
  }

  // 2e. Default designations and departments (editable in the app)
  const designations: [string, boolean][] = [
    ["Principal", false],
    ["Vice Principal", false],
    ["Senior Teacher", true],
    ["Teacher", true],
    ["Accountant", false],
    ["Clerk", false],
    ["Librarian", false],
    ["Driver", false],
    ["Security Guard", false],
    ["Support Staff", false],
  ];
  for (const [i, [name, isTeaching]] of designations.entries()) {
    await prisma.designation.upsert({
      where: { name },
      update: {},
      create: { name, isTeaching, sortOrder: i + 1 },
    });
  }
  for (const [i, name] of [
    "Administration",
    "Academics",
    "Accounts",
    "Library",
    "Transport",
    "Support",
  ].entries()) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: i + 1 },
    });
  }

  // 2f. Starter salary components (editable in the app)
  const components: [string, "ALLOWANCE" | "DEDUCTION", boolean][] = [
    ["House Rent", "ALLOWANCE", true],
    ["Medical Allowance", "ALLOWANCE", false],
    ["Transport Allowance", "ALLOWANCE", false],
    ["Provident Fund", "DEDUCTION", true],
    ["Income Tax", "DEDUCTION", false],
  ];
  for (const [i, [name, type, isPercent]] of components.entries()) {
    await prisma.salaryComponent.upsert({
      where: { name },
      update: {},
      create: { name, type, isPercent, sortOrder: i + 1 },
    });
  }

  // 2g. Starter book categories (editable in the app)
  for (const [i, name] of [
    "Fiction",
    "Non-fiction",
    "Science",
    "Mathematics",
    "Textbooks",
    "Reference",
    "Urdu literature",
    "Islamic studies",
    "Children's books",
  ].entries()) {
    await prisma.bookCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: i + 1 },
    });
  }
}

main()
  .then(() => seedGradingScale())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize, tenant } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { loadScope, isScopedTeacher } from "./scope";
import {
  accountSchema,
  activeSchema,
  assignmentQuerySchema,
  classTeachersSchema,
  ClassTeachersInput,
  departmentSchema,
  designationSchema,
  employeeListSchema,
  EmployeeListQuery,
  employeeSchema,
  EmployeeInput,
  payrollDetailsSchema,
  PayrollDetailsInput,
  scopeQuerySchema,
  statusSchema,
  StatusInput,
  teachingSchema,
  TeachingInput,
} from "./staff.schema";
import {
  changeStatus,
  createAccount,
  createEmployee,
  getAssignments,
  resetPassword,
  saveClassTeachers,
  savePayrollDetails,
  saveTeaching,
  setAccountActive,
  updateEmployee,
} from "./staff.service";

export const staffRouter = Router();
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// =========================== Designations and departments ===========================
staffRouter.get(
  "/designations",
  authorize("staff", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.designation.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ),
  ),
);
staffRouter.post(
  "/designations",
  authorize("staff", "CREATE"),
  validate(designationSchema),
  h(async (req, res) => {
    const row = await prisma.designation.create({ data: req.body });
    await writeAudit(req, {
      action: "DESIGNATION_CREATED",
      entity: "designations",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);
staffRouter.put(
  "/designations/:id",
  authorize("staff", "EDIT"),
  validate(idParam, "params"),
  validate(designationSchema),
  h(async (req, res) => {
    const row = await prisma.designation.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "DESIGNATION_UPDATED",
      entity: "designations",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);
staffRouter.delete(
  "/designations/:id",
  authorize("staff", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.designation.delete({ where: { id: req.params.id } }); // Restrict FK: refused once employees use it
    await writeAudit(req, {
      action: "DESIGNATION_DELETED",
      entity: "designations",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

staffRouter.get(
  "/departments",
  authorize("staff", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.department.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ),
  ),
);
staffRouter.post(
  "/departments",
  authorize("staff", "CREATE"),
  validate(departmentSchema),
  h(async (req, res) => {
    const row = await prisma.department.create({ data: req.body });
    await writeAudit(req, {
      action: "DEPARTMENT_CREATED",
      entity: "departments",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);
staffRouter.put(
  "/departments/:id",
  authorize("staff", "EDIT"),
  validate(idParam, "params"),
  validate(departmentSchema),
  h(async (req, res) => {
    const row = await prisma.department.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "DEPARTMENT_UPDATED",
      entity: "departments",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);
staffRouter.delete(
  "/departments/:id",
  authorize("staff", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.department.delete({ where: { id: req.params.id } });
    await writeAudit(req, {
      action: "DEPARTMENT_DELETED",
      entity: "departments",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Employees ===========================
const listWhere = (qy: EmployeeListQuery): Prisma.EmployeeWhereInput => ({
  ...(qy.status && { status: qy.status }),
  ...(qy.isTeacher && { isTeacher: qy.isTeacher === "true" }),
  ...(qy.designationId && { designationId: qy.designationId }),
  ...(qy.departmentId && { departmentId: qy.departmentId }),
  ...(qy.q && {
    OR: [
      { fullName: { contains: qy.q, mode: "insensitive" } },
      { employeeNo: { contains: qy.q, mode: "insensitive" } },
      { phone: { contains: qy.q } },
      { cnic: { contains: qy.q.replace(/-/g, "") } },
    ],
  }),
});
const include = {
  designation: { select: { name: true } },
  department: { select: { name: true } },
};

staffRouter.get(
  "/employees",
  authorize("staff", "VIEW"),
  validate(employeeListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as EmployeeListQuery;
    const where = listWhere(qy);
    const [rows, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        include,
        orderBy: [{ employeeNo: "asc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      items: rows.map((e) => ({
        id: e.id,
        employeeNo: e.employeeNo,
        fullName: e.fullName,
        gender: e.gender,
        phone: e.phone,
        email: e.email,
        designation: e.designation.name,
        department: e.department?.name ?? null,
        employmentType: e.employmentType,
        status: e.status,
        isTeacher: e.isTeacher,
        joiningDate: e.joiningDate,
        hasAccount: !!e.userId,
      })),
    });
  }),
);

// Must stay above /employees/:id
staffRouter.get(
  "/employees/export",
  authorize("staff", "EXPORT"),
  validate(employeeListSchema, "query"),
  h(async (req, res) => {
    const rows = await prisma.employee.findMany({
      where: listWhere(req.query as unknown as EmployeeListQuery),
      include,
      orderBy: { employeeNo: "asc" },
      take: 10000,
    });
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "employees",
      newValues: { rows: rows.length },
    });
    await sendXlsx(
      res,
      `staff-${new Date().toISOString().slice(0, 10)}`,
      "Staff",
      [
        { header: "Employee no", key: "no", width: 14 },
        { header: "Name", key: "name", width: 26 },
        { header: "Father", key: "father", width: 24 },
        { header: "Gender", key: "gender", width: 9 },
        { header: "CNIC", key: "cnic", width: 16 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Email", key: "email", width: 26 },
        { header: "Designation", key: "des", width: 18 },
        { header: "Department", key: "dep", width: 16 },
        { header: "Type", key: "type", width: 12 },
        { header: "Teaching", key: "teacher", width: 9 },
        { header: "Joined", key: "joined", width: 12 },
        { header: "Status", key: "status", width: 12 },
        { header: "Left", key: "left", width: 12 },
      ],
      rows.map((e) => ({
        no: e.employeeNo,
        name: e.fullName,
        father: e.fatherName ?? "",
        gender: e.gender,
        cnic: e.cnic ?? "",
        phone: e.phone,
        email: e.email ?? "",
        des: e.designation.name,
        dep: e.department?.name ?? "",
        type: e.employmentType,
        teacher: e.isTeacher ? "Yes" : "No",
        joined: day(e.joiningDate),
        status: e.status,
        left: day(e.leavingDate) ?? "",
      })),
    );
  }),
);

staffRouter.get(
  "/employees/:id",
  authorize("staff", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const e = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include,
    });
    if (!e) throw ApiError.notFound("Employee not found");
    const perms = req.user!.permissions;
    const canPayroll = perms.has("payroll:VIEW");

    const wanted =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const sessionId =
      wanted ??
      (
        await prisma.academicSession.findFirst({
          where: { ...tenant(req), isActive: true },
          select: { id: true },
        })
      )?.id;

    const [history, account, classTeacher, teaching] = await Promise.all([
      prisma.employeeHistory.findMany({
        where: {
          employeeId: e.id,
          ...(canPayroll
            ? {}
            : {
                field: {
                  notIn: ["Basic salary", "Bank details", "Salary structure"],
                },
              }),
        },
        orderBy: { changedAt: "desc" },
        take: 100,
      }),
      e.userId
        ? prisma.user.findUnique({
            where: { id: e.userId },
            select: {
              email: true,
              isActive: true,
              mustChangePassword: true,
              lastLoginAt: true,
              userRoles: { select: { role: { select: { name: true } } } },
            },
          })
        : null,
      sessionId
        ? prisma.classTeacherAssignment.findFirst({
            where: { sessionId, employeeId: e.id },
            include: {
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          })
        : null,
      sessionId
        ? prisma.teacherAssignment.findMany({
            where: { sessionId, employeeId: e.id },
            include: {
              class: { select: { name: true, level: true } },
              section: { select: { name: true } },
              subject: { select: { name: true } },
            },
          })
        : [],
    ]);
    const names = await prisma.user.findMany({
      where: {
        id: {
          in: history.map((x) => x.changedById).filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const by = new Map(names.map((u) => [u.id, u.fullName]));

    const {
      basicSalary,
      bankName,
      accountTitle,
      accountNo,
      userId: _userId,
      ...rest
    } = e;
    ok(res, {
      ...rest,
      designationName: e.designation.name,
      departmentName: e.department?.name ?? null,
      payroll: canPayroll
        ? {
            basicSalary: basicSalary ? basicSalary.toFixed(2) : null,
            bankName,
            accountTitle,
            accountNo,
          }
        : null,
      account: account
        ? {
            email: account.email,
            isActive: account.isActive,
            mustChangePassword: account.mustChangePassword,
            lastLoginAt: account.lastLoginAt,
            roles: account.userRoles.map((r) => r.role.name),
          }
        : null,
      classTeacherOf: classTeacher
        ? {
            className: classTeacher.class.name,
            sectionName: classTeacher.section.name,
          }
        : null,
      teaching: teaching
        .sort((a, b) => a.class.level - b.class.level)
        .map((t) => ({
          className: t.class.name,
          sectionName: t.section.name,
          subjectName: t.subject.name,
        })),
      history: history.map((x) => ({
        id: x.id,
        field: x.field,
        oldValue: x.oldValue,
        newValue: x.newValue,
        note: x.note,
        changedAt: x.changedAt,
        changedBy: x.changedById ? (by.get(x.changedById) ?? null) : null,
      })),
    });
  }),
);

staffRouter.post(
  "/employees",
  authorize("staff", "CREATE"),
  validate(employeeSchema),
  h(async (req, res) => {
    const r = await createEmployee(req.body as EmployeeInput, req.user!.id);
    await writeAudit(req, {
      action: "EMPLOYEE_CREATED",
      entity: "employees",
      entityId: r.id,
      newValues: { employeeNo: r.employeeNo, fullName: req.body.fullName },
    });
    ok(res, r, 201);
  }),
);

staffRouter.put(
  "/employees/:id",
  authorize("staff", "EDIT"),
  validate(idParam, "params"),
  validate(employeeSchema),
  h(async (req, res) => {
    const r = await updateEmployee(
      req.params.id,
      req.body as EmployeeInput,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "EMPLOYEE_UPDATED",
      entity: "employees",
      entityId: r.id,
    });
    ok(res, r);
  }),
);

staffRouter.post(
  "/employees/:id/status",
  authorize("staff", "EDIT"),
  validate(idParam, "params"),
  validate(statusSchema),
  h(async (req, res) => {
    const r = await changeStatus(
      req.params.id,
      req.body as StatusInput,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "EMPLOYEE_STATUS_CHANGED",
      entity: "employees",
      entityId: req.params.id,
      newValues: { ...r, reason: req.body.reason },
    });
    ok(res, r);
  }),
);

// Salary and bank details need payroll permission, separate from staff permission.
staffRouter.put(
  "/employees/:id/payroll-details",
  authorize("payroll", "EDIT"),
  validate(idParam, "params"),
  validate(payrollDetailsSchema),
  h(async (req, res) => {
    const r = await savePayrollDetails(
      req.params.id,
      req.body as PayrollDetailsInput,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "EMPLOYEE_PAYROLL_DETAILS_SAVED",
      entity: "employees",
      entityId: req.params.id,
    }); // amounts are not copied into the audit log
    ok(res, r);
  }),
);

// Login accounts need user-management permission. The temporary password is returned once and never stored in plain text.
staffRouter.post(
  "/employees/:id/account",
  authorize("users", "CREATE"),
  validate(idParam, "params"),
  validate(accountSchema),
  h(async (req, res) => {
    const r = await createAccount(
      req.params.id,
      req.body,
      req.user!.schoolId,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "EMPLOYEE_ACCOUNT_CREATED",
      entity: "employees",
      entityId: req.params.id,
      newValues: { email: r.email, role: req.body.roleSlug },
    });
    ok(res, r, 201);
  }),
);
staffRouter.post(
  "/employees/:id/account/reset",
  authorize("users", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await resetPassword(req.params.id, req.user!.id);
    await writeAudit(req, {
      action: "EMPLOYEE_PASSWORD_RESET",
      entity: "employees",
      entityId: req.params.id,
    });
    ok(res, r);
  }),
);
staffRouter.post(
  "/employees/:id/account/active",
  authorize("users", "EDIT"),
  validate(idParam, "params"),
  validate(activeSchema),
  h(async (req, res) => {
    const r = await setAccountActive(
      req.params.id,
      req.body.isActive,
      req.user!.id,
    );
    await writeAudit(req, {
      action: "EMPLOYEE_ACCOUNT_ACTIVE",
      entity: "employees",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r);
  }),
);

// =========================== Assignments ===========================
staffRouter.get(
  "/teachers",
  authorize("academics", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.employee.findMany({
        where: { isTeacher: true, status: "ACTIVE" },
        orderBy: { fullName: "asc" },
        select: { id: true, employeeNo: true, fullName: true },
      }),
    ),
  ),
);

staffRouter.get(
  "/assignments",
  authorize("academics", "VIEW"),
  validate(assignmentQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as { sessionId: string; classId: string };
    ok(res, await getAssignments(q.sessionId, q.classId));
  }),
);

staffRouter.put(
  "/assignments/class-teachers",
  authorize("academics", "EDIT"),
  validate(classTeachersSchema),
  h(async (req, res) => {
    const r = await saveClassTeachers(req.body as ClassTeachersInput);
    await writeAudit(req, {
      action: "CLASS_TEACHERS_SAVED",
      entity: "class_teacher_assignments",
      newValues: {
        sessionId: req.body.sessionId,
        classId: req.body.classId,
        cells: req.body.cells,
      },
    });
    ok(res, r);
  }),
);

staffRouter.put(
  "/assignments/teaching",
  authorize("academics", "EDIT"),
  validate(teachingSchema),
  h(async (req, res) => {
    const r = await saveTeaching(req.body as TeachingInput);
    await writeAudit(req, {
      action: "TEACHER_ASSIGNMENTS_SAVED",
      entity: "teacher_assignments",
      newValues: {
        sessionId: req.body.sessionId,
        classId: req.body.classId,
        cells: req.body.cells.length,
      },
    });
    ok(res, r);
  }),
);

// What the signed-in user is limited to. Used to narrow the dropdowns; the server enforces the limit regardless.
staffRouter.get(
  "/my-scope",
  validate(scopeQuerySchema, "query"),
  h(async (req, res) => {
    const wanted = (req.query as { sessionId?: string }).sessionId;
    const sessionId =
      wanted ??
      (
        await prisma.academicSession.findFirst({
          where: { ...tenant(req), isActive: true },
          select: { id: true },
        })
      )?.id;
    if (!isScopedTeacher(req.user!) || !sessionId)
      return ok(res, { restricted: false, classTeacher: [], teaching: [] });
    ok(res, {
      restricted: true,
      ...(await loadScope(req.user!.id, sessionId)),
    });
  }),
);

import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { ZERO } from "../fees/invoices.calc";
import { METHOD_LABEL, nextNo } from "./finance.service";
import {
  expenseCategorySchema,
  expenseListSchema,
  ExpenseListQuery,
  expenseSchema,
  ExpenseInput,
  reasonSchema,
} from "./finance.schema";
import {
  displayName,
  MAX_BYTES,
  MAX_FILES_PER_EXPENSE,
  removeUpload,
  saveUpload,
  uploadPath,
  validateUpload,
} from "./uploads";

// =========================== Categories ===========================
export const expenseCategoriesRouter = Router();

expenseCategoriesRouter.get(
  "/",
  authorize("expenses", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.expenseCategory.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ),
  ),
);

expenseCategoriesRouter.post(
  "/",
  authorize("expenses", "CREATE"),
  validate(expenseCategorySchema),
  h(async (req, res) => {
    const row = await prisma.expenseCategory.create({ data: req.body });
    await writeAudit(req, {
      action: "EXPENSE_CATEGORY_CREATED",
      entity: "expense_categories",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);

expenseCategoriesRouter.put(
  "/:id",
  authorize("expenses", "EDIT"),
  validate(idParam, "params"),
  validate(expenseCategorySchema),
  h(async (req, res) => {
    const row = await prisma.expenseCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "EXPENSE_CATEGORY_UPDATED",
      entity: "expense_categories",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);

// Restrict FK: refused with 409 once any expense uses the category.
expenseCategoriesRouter.delete(
  "/:id",
  authorize("expenses", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.expenseCategory.delete({ where: { id: req.params.id } });
    await writeAudit(req, {
      action: "EXPENSE_CATEGORY_DELETED",
      entity: "expense_categories",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Expenses ===========================
export const expensesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});
const receiveFile = (req: Request, res: Response, next: NextFunction) =>
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    next(
      ApiError.badRequest(
        code === "LIMIT_FILE_SIZE"
          ? "The file is too large (5 MB maximum)"
          : "The upload failed",
      ),
    );
  });

function expenseWhere(qy: ExpenseListQuery): Prisma.ExpenseWhereInput {
  return {
    ...(qy.status && { status: qy.status }),
    ...(qy.categoryId && { categoryId: qy.categoryId }),
    ...(qy.method && { method: qy.method }),
    ...((qy.from || qy.to) && {
      expenseDate: {
        ...(qy.from && { gte: qy.from }),
        ...(qy.to && { lte: qy.to }),
      },
    }),
    ...(qy.q && {
      OR: [
        { description: { contains: qy.q, mode: "insensitive" } },
        { paidTo: { contains: qy.q, mode: "insensitive" } },
        { expenseNo: { contains: qy.q, mode: "insensitive" } },
      ],
    }),
  };
}

const userNames = async (ids: (string | null)[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: ids.filter((x): x is string => !!x) } },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((u) => [u.id, u.fullName]));
};

expensesRouter.get(
  "/",
  authorize("expenses", "VIEW"),
  validate(expenseListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as ExpenseListQuery;
    const where = expenseWhere(qy);
    const [rows, total, approved, pending] = await prisma.$transaction([
      prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: "desc" }, { expenseNo: "desc" }],
        skip: (qy.page - 1) * qy.pageSize,
        take: qy.pageSize,
        include: {
          category: { select: { name: true } },
          _count: { select: { attachments: true } },
        },
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        where: { ...where, status: "APPROVED" },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { ...where, status: "PENDING" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const names = await userNames(rows.map((r) => r.createdById));
    ok(res, {
      page: qy.page,
      pageSize: qy.pageSize,
      total,
      summary: {
        approvedTotal: (approved._sum.amount ?? ZERO).toFixed(2),
        pendingCount: pending._count._all,
        pendingTotal: (pending._sum.amount ?? ZERO).toFixed(2),
      },
      items: rows.map((r) => ({
        id: r.id,
        expenseNo: r.expenseNo,
        description: r.description,
        amount: r.amount,
        expenseDate: r.expenseDate,
        method: r.method,
        paidTo: r.paidTo,
        reference: r.reference,
        status: r.status,
        rejectionReason: r.rejectionReason,
        voidReason: r.voidReason,
        categoryId: r.categoryId,
        categoryName: r.category.name,
        attachmentCount: r._count.attachments,
        createdBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
      })),
    });
  }),
);

// Must stay above /:id
expensesRouter.get(
  "/export",
  authorize("expenses", "EXPORT"),
  validate(expenseListSchema, "query"),
  h(async (req, res) => {
    const qy = req.query as unknown as ExpenseListQuery;
    const rows = await prisma.expense.findMany({
      where: expenseWhere(qy),
      orderBy: [{ expenseDate: "asc" }, { expenseNo: "asc" }],
      take: 20000,
      include: { category: { select: { name: true } } },
    });
    const names = await userNames(rows.map((r) => r.createdById));
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "expenses",
      newValues: { rows: rows.length },
    });
    const approvedTotal = rows
      .filter((r) => r.status === "APPROVED")
      .reduce((s, r) => s + Number(r.amount), 0);
    await sendXlsx(
      res,
      `expenses-${new Date().toISOString().slice(0, 10)}`,
      "Expenses",
      [
        { header: "Expense no", key: "no", width: 16 },
        { header: "Date", key: "date", width: 13 },
        { header: "Category", key: "category", width: 18 },
        { header: "Description", key: "description", width: 36 },
        { header: "Paid to", key: "paidTo", width: 22 },
        { header: "Method", key: "method", width: 14 },
        { header: "Reference", key: "reference", width: 18 },
        { header: "Amount", key: "amount", width: 16, money: true },
        { header: "Status", key: "status", width: 12 },
        { header: "Entered by", key: "by", width: 20 },
      ],
      rows.map((r) => ({
        no: r.expenseNo,
        date: r.expenseDate.toISOString().slice(0, 10),
        category: r.category.name,
        description: r.description,
        paidTo: r.paidTo ?? "",
        method: METHOD_LABEL[r.method],
        reference: r.reference ?? "",
        amount: Number(r.amount),
        status: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        by: r.createdById ? (names.get(r.createdById) ?? "") : "",
      })),
      { description: "Total of approved expenses", amount: approvedTotal },
    );
  }),
);

// Open a receipt (signed-in users with View permission only)
expensesRouter.get(
  "/attachments/:id",
  authorize("expenses", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const a = await prisma.expenseAttachment.findUnique({
      where: { id: req.params.id },
    });
    if (!a) throw ApiError.notFound("Receipt not found");
    res.setHeader("Content-Type", a.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
    );
    res.sendFile(uploadPath(a.storedName), (err) => {
      if (err && !res.headersSent)
        res.status(404).json({
          success: false,
          message: "The file is missing on the server",
        });
    });
  }),
);

expensesRouter.get(
  "/:id",
  authorize("expenses", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const e = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { name: true } },
        attachments: {
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!e) throw ApiError.notFound("Expense not found");
    ok(res, { ...e, categoryName: e.category.name });
  }),
);

// Created PENDING, or approved straight away when the creator is allowed to approve.
expensesRouter.post(
  "/",
  authorize("expenses", "CREATE"),
  validate(expenseSchema),
  h(async (req, res) => {
    const b = req.body as ExpenseInput;
    const cat = await prisma.expenseCategory.findUnique({
      where: { id: b.categoryId },
    });
    if (!cat || !cat.isActive)
      throw ApiError.badRequest("Choose an active expense category");

    const approve = req.user!.permissions.has("expenses:APPROVE");
    const row = await prisma.$transaction(async (tx) =>
      tx.expense.create({
        data: {
          ...b,
          expenseNo: await nextNo(tx, "EXP", b.expenseDate),
          createdById: req.user!.id,
          status: approve ? "APPROVED" : "PENDING",
          approvedById: approve ? req.user!.id : null,
          approvedAt: approve ? new Date() : null,
        },
        select: { id: true, expenseNo: true, status: true },
      }),
    );
    await writeAudit(req, {
      action: "EXPENSE_CREATED",
      entity: "expenses",
      entityId: row.id,
      newValues: { ...b, expenseNo: row.expenseNo, status: row.status },
    });
    ok(res, row, 201);
  }),
);

// Only pending or rejected expenses can be edited. Editing a rejected one sends it back for approval.
expensesRouter.put(
  "/:id",
  authorize("expenses", "EDIT"),
  validate(idParam, "params"),
  validate(expenseSchema),
  h(async (req, res) => {
    const b = req.body as ExpenseInput;
    const found = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Expense not found");
    if (found.status !== "PENDING" && found.status !== "REJECTED")
      throw ApiError.conflict(
        "Approved expenses are locked. Void it and enter the corrected expense.",
      );
    const cat = await prisma.expenseCategory.findUnique({
      where: { id: b.categoryId },
    });
    if (!cat || (!cat.isActive && cat.id !== found.categoryId))
      throw ApiError.badRequest("Choose an active expense category");

    const row = await prisma.expense.update({
      where: { id: found.id },
      data: { ...b, status: "PENDING", rejectionReason: null },
    });
    await writeAudit(req, {
      action: "EXPENSE_UPDATED",
      entity: "expenses",
      entityId: row.id,
      oldValues: found,
      newValues: row,
    });
    ok(res, { id: row.id, status: row.status });
  }),
);

expensesRouter.post(
  "/:id/approve",
  authorize("expenses", "APPROVE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const e = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!e) throw ApiError.notFound("Expense not found");
    if (e.status !== "PENDING")
      throw ApiError.conflict(
        `This expense is already ${e.status.toLowerCase()}`,
      );
    await prisma.expense.update({
      where: { id: e.id },
      data: {
        status: "APPROVED",
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "EXPENSE_APPROVED",
      entity: "expenses",
      entityId: e.id,
    });
    ok(res, { id: e.id });
  }),
);

expensesRouter.post(
  "/:id/reject",
  authorize("expenses", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const e = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!e) throw ApiError.notFound("Expense not found");
    if (e.status !== "PENDING")
      throw ApiError.conflict(
        `This expense is already ${e.status.toLowerCase()}`,
      );
    await prisma.expense.update({
      where: { id: e.id },
      data: {
        status: "REJECTED",
        rejectionReason: req.body.reason,
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "EXPENSE_REJECTED",
      entity: "expenses",
      entityId: e.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: e.id });
  }),
);

// An approved expense is never deleted. Voiding keeps the record and removes it from the books.
expensesRouter.post(
  "/:id/void",
  authorize("expenses", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const e = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!e) throw ApiError.notFound("Expense not found");
    if (e.status !== "APPROVED")
      throw ApiError.conflict("Only approved expenses can be voided");
    await prisma.expense.update({
      where: { id: e.id },
      data: {
        status: "VOIDED",
        voidReason: req.body.reason,
        voidedAt: new Date(),
      },
    });
    await writeAudit(req, {
      action: "EXPENSE_VOIDED",
      entity: "expenses",
      entityId: e.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, { id: e.id });
  }),
);

// ---- Receipts ----
expensesRouter.post(
  "/:id/attachments",
  authorize("expenses", "EDIT"),
  validate(idParam, "params"),
  receiveFile,
  h(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest("Choose a file to upload");
    const e = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { attachments: true } } },
    });
    if (!e) throw ApiError.notFound("Expense not found");
    if (e.status === "VOIDED" || e.status === "REJECTED")
      throw ApiError.conflict("Receipts cannot be added to this expense");
    if (e._count.attachments >= MAX_FILES_PER_EXPENSE)
      throw ApiError.conflict(
        `An expense can have at most ${MAX_FILES_PER_EXPENSE} receipts`,
      );

    const check = validateUpload(file);
    if ("error" in check) throw ApiError.badRequest(check.error);

    const storedName = await saveUpload(file.buffer, check.ext);
    try {
      const row = await prisma.expenseAttachment.create({
        data: {
          expenseId: e.id,
          fileName: displayName(file.originalname),
          storedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: req.user!.id,
        },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      });
      await writeAudit(req, {
        action: "EXPENSE_RECEIPT_ADDED",
        entity: "expenses",
        entityId: e.id,
        newValues: { fileName: row.fileName },
      });
      ok(res, row, 201);
    } catch (err) {
      await removeUpload(storedName); // never leave an orphan file behind
      throw err;
    }
  }),
);

expensesRouter.delete(
  "/attachments/:id",
  authorize("expenses", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const a = await prisma.expenseAttachment.findUnique({
      where: { id: req.params.id },
      include: { expense: { select: { status: true } } },
    });
    if (!a) throw ApiError.notFound("Receipt not found");
    if (a.expense.status !== "PENDING")
      throw ApiError.conflict(
        "Receipts can only be removed while the expense is pending",
      );
    await prisma.expenseAttachment.delete({ where: { id: a.id } });
    await removeUpload(a.storedName);
    await writeAudit(req, {
      action: "EXPENSE_RECEIPT_REMOVED",
      entity: "expenses",
      entityId: a.expenseId,
      newValues: { fileName: a.fileName },
    });
    ok(res, { id: a.id });
  }),
);

import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { idParam } from "../academics/academics.schema";
import { buildLibraryReport } from "./library.reports";
import {
  addCopiesSchema,
  bookListSchema,
  BookListQuery,
  bookSchema,
  BookInput,
  borrowerParamSchema,
  borrowerSearchSchema,
  categorySchema,
  copyListSchema,
  CopyListQuery,
  fineListSchema,
  FineListQuery,
  issueListSchema,
  IssueListQuery,
  issueSchema,
  IssueInput,
  lookupSchema,
  lostSchema,
  LostInput,
  newBookSchema,
  NewBookInput,
  noteSchema,
  payFineSchema,
  reasonSchema,
  reportParamSchema,
  reportQuerySchema,
  ReportQuery,
  LibReportType,
  returnSchema,
  ReturnInput,
  settingsSchema,
  SettingsInput,
} from "./library.schema";
import {
  addCopies,
  borrowerSummary,
  createBook,
  issueBook,
  listBooks,
  listCopies,
  listFines,
  listIssues,
  loadSettings,
  lookupOpenIssue,
  markLost,
  overdueList,
  payFine,
  restoreCopy,
  returnBook,
  renewIssue,
  reverseFinePayment,
  saveSettings,
  searchBorrowers,
  updateBook,
  waiveFine,
  withdrawCopy,
} from "./library.service";

export const libraryRouter = Router();
const schoolOf = (req: { user?: { schoolId: string } }) => req.user!.schoolId;

// =========================== Rules ===========================
libraryRouter.get(
  "/settings",
  authorize("library", "VIEW"),
  h(async (req, res) => ok(res, await loadSettings(schoolOf(req)))),
);
libraryRouter.put(
  "/settings",
  authorize("library", "EDIT"),
  validate(settingsSchema),
  h(async (req, res) => {
    const r = await saveSettings(schoolOf(req), req.body as SettingsInput);
    await writeAudit(req, {
      action: "LIBRARY_RULES_SAVED",
      entity: "school_settings",
      newValues: r,
    });
    ok(res, r);
  }),
);

// =========================== Categories ===========================
libraryRouter.get(
  "/categories",
  authorize("library", "VIEW"),
  h(async (_req, res) =>
    ok(
      res,
      await prisma.bookCategory.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ),
  ),
);
libraryRouter.post(
  "/categories",
  authorize("library", "CREATE"),
  validate(categorySchema),
  h(async (req, res) => {
    const row = await prisma.bookCategory.create({ data: req.body });
    await writeAudit(req, {
      action: "BOOK_CATEGORY_CREATED",
      entity: "book_categories",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row, 201);
  }),
);
libraryRouter.put(
  "/categories/:id",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  validate(categorySchema),
  h(async (req, res) => {
    const row = await prisma.bookCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await writeAudit(req, {
      action: "BOOK_CATEGORY_UPDATED",
      entity: "book_categories",
      entityId: row.id,
      newValues: row,
    });
    ok(res, row);
  }),
);
libraryRouter.delete(
  "/categories/:id",
  authorize("library", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    await prisma.bookCategory.delete({ where: { id: req.params.id } }); // Restrict FK: refused once books use it
    await writeAudit(req, {
      action: "BOOK_CATEGORY_DELETED",
      entity: "book_categories",
      entityId: req.params.id,
    });
    ok(res, { id: req.params.id });
  }),
);

// =========================== Books and copies ===========================
libraryRouter.get(
  "/books",
  authorize("library", "VIEW"),
  validate(bookListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listBooks(req.query as unknown as BookListQuery)),
  ),
);
libraryRouter.post(
  "/books",
  authorize("library", "CREATE"),
  validate(newBookSchema),
  h(async (req, res) => {
    const r = await createBook(req.body as NewBookInput);
    await writeAudit(req, {
      action: "BOOK_REGISTERED",
      entity: "books",
      entityId: r.id,
      newValues: {
        title: req.body.title,
        isbn: req.body.isbn,
        copies: r.accessionNos,
      },
    });
    ok(res, r, 201);
  }),
);
libraryRouter.put(
  "/books/:id",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  validate(bookSchema),
  h(async (req, res) => {
    const r = await updateBook(req.params.id, req.body as BookInput);
    await writeAudit(req, {
      action: "BOOK_UPDATED",
      entity: "books",
      entityId: r.id,
      newValues: req.body,
    });
    ok(res, r);
  }),
);
libraryRouter.post(
  "/books/:id/copies",
  authorize("library", "CREATE"),
  validate(idParam, "params"),
  validate(addCopiesSchema),
  h(async (req, res) => {
    const r = await addCopies(req.params.id, req.body.count);
    await writeAudit(req, {
      action: "BOOK_COPIES_ADDED",
      entity: "books",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r, 201);
  }),
);

libraryRouter.get(
  "/copies",
  authorize("library", "VIEW"),
  validate(copyListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listCopies(req.query as unknown as CopyListQuery)),
  ),
);
libraryRouter.post(
  "/copies/:id/withdraw",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  validate(noteSchema),
  h(async (req, res) => {
    const r = await withdrawCopy(req.params.id, req.body.note);
    await writeAudit(req, {
      action: "BOOK_COPY_WITHDRAWN",
      entity: "book_copies",
      entityId: req.params.id,
      newValues: { note: req.body.note },
    });
    ok(res, r);
  }),
);
libraryRouter.post(
  "/copies/:id/restore",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  validate(noteSchema),
  h(async (req, res) => {
    const r = await restoreCopy(req.params.id, req.body.note);
    await writeAudit(req, {
      action: "BOOK_COPY_RESTORED",
      entity: "book_copies",
      entityId: req.params.id,
      newValues: { note: req.body.note },
    });
    ok(res, r);
  }),
);

// =========================== Borrowers ===========================
libraryRouter.get(
  "/borrowers",
  authorize("library", "VIEW"),
  validate(borrowerSearchSchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as {
      type: "STUDENT" | "EMPLOYEE";
      q: string;
    };
    ok(res, await searchBorrowers(q.type, q.q));
  }),
);
libraryRouter.get(
  "/borrowers/:type/:id",
  authorize("library", "VIEW"),
  validate(borrowerParamSchema, "params"),
  h(async (req, res) =>
    ok(
      res,
      await borrowerSummary(
        schoolOf(req),
        req.params.type as "STUDENT" | "EMPLOYEE",
        req.params.id,
      ),
    ),
  ),
);

// =========================== Issue, return, renew, lost ===========================
libraryRouter.get(
  "/issues",
  authorize("library", "VIEW"),
  validate(issueListSchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await listIssues(schoolOf(req), req.query as unknown as IssueListQuery),
    ),
  ),
);
libraryRouter.get(
  "/issues/lookup",
  authorize("library", "VIEW"),
  validate(lookupSchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await lookupOpenIssue(
        schoolOf(req),
        (req.query as { accessionNo: string }).accessionNo,
      ),
    ),
  ),
);
libraryRouter.post(
  "/issues",
  authorize("library", "CREATE"),
  validate(issueSchema),
  h(async (req, res) => {
    const r = await issueBook(
      schoolOf(req),
      req.user!.id,
      req.body as IssueInput,
    );
    await writeAudit(req, {
      action: "BOOK_ISSUED",
      entity: "library_issues",
      entityId: r.id,
      newValues: {
        issueNo: r.issueNo,
        accessionNo: r.accessionNo,
        borrowerType: req.body.borrowerType,
        dueDate: r.dueDate,
      },
    });
    ok(res, r, 201);
  }),
);
libraryRouter.post(
  "/issues/:id/return",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  validate(returnSchema),
  h(async (req, res) => {
    const r = await returnBook(
      schoolOf(req),
      req.user!.id,
      req.params.id,
      req.body as ReturnInput,
    );
    await writeAudit(req, {
      action: "BOOK_RETURNED",
      entity: "library_issues",
      entityId: req.params.id,
      newValues: {
        condition: req.body.condition,
        daysLate: r.daysLate,
        fines: r.fines,
      },
    });
    ok(res, r);
  }),
);
libraryRouter.post(
  "/issues/:id/renew",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const r = await renewIssue(schoolOf(req), req.params.id);
    await writeAudit(req, {
      action: "BOOK_RENEWED",
      entity: "library_issues",
      entityId: req.params.id,
      newValues: { dueDate: r.dueDate },
    });
    ok(res, r);
  }),
);
libraryRouter.post(
  "/issues/:id/lost",
  authorize("library", "EDIT"),
  validate(idParam, "params"),
  validate(lostSchema),
  h(async (req, res) => {
    const r = await markLost(
      req.user!.id,
      req.params.id,
      req.body as LostInput,
    );
    await writeAudit(req, {
      action: "BOOK_MARKED_LOST",
      entity: "library_issues",
      entityId: req.params.id,
      newValues: r,
    });
    ok(res, r);
  }),
);
libraryRouter.get(
  "/overdue",
  authorize("library", "VIEW"),
  h(async (req, res) => ok(res, await overdueList(schoolOf(req)))),
);

// =========================== Fines ===========================
libraryRouter.get(
  "/fines",
  authorize("library", "VIEW"),
  validate(fineListSchema, "query"),
  h(async (req, res) =>
    ok(res, await listFines(req.query as unknown as FineListQuery)),
  ),
);
libraryRouter.post(
  "/fines/:id/pay",
  authorize("library", "CREATE"),
  validate(idParam, "params"),
  validate(payFineSchema),
  h(async (req, res) => {
    const r = await payFine(req.params.id, req.body, req.user!.id);
    await writeAudit(req, {
      action: "LIBRARY_FINE_PAID",
      entity: "library_fines",
      entityId: req.params.id,
      newValues: {
        fineNo: r.fineNo,
        incomeNo: r.incomeNo,
        method: req.body.method,
      },
    });
    ok(res, r);
  }),
);
libraryRouter.post(
  "/fines/:id/waive",
  authorize("library", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await waiveFine(req.params.id, req.body.reason, req.user!.id);
    await writeAudit(req, {
      action: "LIBRARY_FINE_WAIVED",
      entity: "library_fines",
      entityId: req.params.id,
      newValues: { reason: req.body.reason },
    });
    ok(res, r);
  }),
);
libraryRouter.post(
  "/fines/:id/reverse",
  authorize("library", "APPROVE"),
  validate(idParam, "params"),
  validate(reasonSchema),
  h(async (req, res) => {
    const r = await reverseFinePayment(req.params.id, req.body.reason);
    await writeAudit(req, {
      action: "LIBRARY_FINE_REVERSED",
      entity: "library_fines",
      entityId: req.params.id,
      newValues: { fineNo: r.fineNo, reason: req.body.reason },
    });
    ok(res, r);
  }),
);

// =========================== Reports ===========================
libraryRouter.get(
  "/reports/:type",
  authorize("library", "VIEW"),
  validate(reportParamSchema, "params"),
  validate(reportQuerySchema, "query"),
  h(async (req, res) =>
    ok(
      res,
      await buildLibraryReport(
        schoolOf(req),
        req.params.type as LibReportType,
        req.query as unknown as ReportQuery,
      ),
    ),
  ),
);
libraryRouter.get(
  "/reports/:type/export",
  authorize("library", "EXPORT"),
  validate(reportParamSchema, "params"),
  validate(reportQuerySchema, "query"),
  h(async (req, res) => {
    const type = req.params.type as LibReportType;
    const r = await buildLibraryReport(
      schoolOf(req),
      type,
      req.query as unknown as ReportQuery,
    );
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: `library_${type}`,
      newValues: { rows: r.rows.length },
    });
    await sendXlsx(
      res,
      `library-${type}-${new Date().toISOString().slice(0, 10)}`,
      r.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
      r.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 12,
      })),
      r.rows,
    );
  }),
);

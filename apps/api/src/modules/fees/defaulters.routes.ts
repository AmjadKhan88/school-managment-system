import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import {
  DefaultersQuery,
  defaultersQuerySchema,
  reminderLogSchema,
} from "./defaulters.schema";
import { listDefaulters } from "./defaulters.service";

export const defaultersRouter = Router();

defaultersRouter.get(
  "/",
  authorize("fees", "VIEW"),
  validate(defaultersQuerySchema, "query"),
  h(async (req, res) => {
    const f = req.query as unknown as DefaultersQuery;
    const r = await listDefaulters(f);
    ok(res, { ...r, page: f.page, pageSize: f.pageSize });
  }),
);

defaultersRouter.get(
  "/export",
  authorize("fees", "EXPORT"),
  validate(defaultersQuerySchema, "query"),
  h(async (req, res) => {
    const f = req.query as unknown as DefaultersQuery;
    const r = await listDefaulters(f, { all: true });
    const date = r.asOf.toISOString().slice(0, 10);

    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "fee_defaulters",
      newValues: {
        rows: r.items.length,
        filters: { ...f, page: undefined, pageSize: undefined },
      },
    });
    await sendXlsx(
      res,
      `fee-defaulters-${date}`,
      "Fee defaulters",
      [
        { header: "Admission no", key: "admissionNo", width: 16 },
        { header: "Student", key: "fullName", width: 28 },
        { header: "Father", key: "fatherName", width: 26 },
        { header: "Class", key: "className", width: 14 },
        { header: "Section", key: "section", width: 10 },
        { header: "Parent contact", key: "phone", width: 18 },
        {
          header: "Total fee (overdue)",
          key: "totalFee",
          width: 18,
          money: true,
        },
        { header: "Paid", key: "paid", width: 14, money: true },
        { header: "Outstanding", key: "outstanding", width: 16, money: true },
        { header: "Overdue months", key: "overdueMonths", width: 16 },
        { header: "Months", key: "months", width: 30 },
        { header: "Last payment", key: "lastPayment", width: 16 },
      ],
      r.items.map((i) => ({
        admissionNo: i.admissionNo,
        fullName: i.fullName,
        fatherName: i.fatherName,
        className: i.className ?? "",
        section: i.section ?? "",
        phone: i.guardianPhone ?? "",
        totalFee: Number(i.totalFee),
        paid: Number(i.paid),
        outstanding: Number(i.outstanding),
        overdueMonths: i.overdueMonths,
        months: i.months.join(", "),
        lastPayment: i.lastPaymentDate
          ? i.lastPaymentDate.toISOString().slice(0, 10)
          : "",
      })),
      {
        fullName: `Total (${r.items.length} students)`,
        outstanding: Number(r.totalOutstanding),
      },
    );
  }),
);

// Records that a reminder was sent (the message itself is sent by the user through WhatsApp).
defaultersRouter.post(
  "/reminders",
  authorize("fees", "EDIT"),
  validate(reminderLogSchema),
  h(async (req, res) => {
    const row = await prisma.feeReminder.create({
      data: {
        studentId: req.body.studentId,
        phone: req.body.phone,
        message: req.body.message,
        sentById: req.user!.id,
      },
      select: { id: true, createdAt: true },
    });
    ok(res, row, 201);
  }),
);

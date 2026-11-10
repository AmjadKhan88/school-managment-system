import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { formatNumber, nextSequence } from "../../utils/sequence";
import { idParam } from "../academics/academics.schema";
import {
  createEnquirySchema,
  ListQuery,
  listQuerySchema,
  statusSchema,
  updateEnquirySchema,
} from "./enquiries.schema";

export const enquiriesRouter = Router();

const classInclude = { interestedClass: { select: { id: true, name: true } } };

// ---- List (search + filters + server-side pagination) ----
enquiriesRouter.get(
  "/",
  authorize("enquiries", "VIEW"),
  validate(listQuerySchema, "query"),
  h(async (req, res) => {
    const { q, status, from, to, page, pageSize } =
      req.query as unknown as ListQuery;
    const where: Prisma.AdmissionEnquiryWhereInput = {
      ...(status && { status }),
      ...((from || to) && {
        enquiryDate: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
      ...(q && {
        OR: [
          { studentName: { contains: q, mode: "insensitive" } },
          { fatherName: { contains: q, mode: "insensitive" } },
          { enquiryNo: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.admissionEnquiry.findMany({
        where,
        include: classInclude,
        orderBy: [{ enquiryDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.admissionEnquiry.count({ where }),
    ]);
    ok(res, { items, total, page, pageSize });
  }),
);

// ---- Stats: counts per status + conversion rate (must stay above /:id) ----
enquiriesRouter.get(
  "/stats",
  authorize("enquiries", "VIEW"),
  h(async (_req, res) => {
    const [groups, followUpsDue] = await Promise.all([
      prisma.admissionEnquiry.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.admissionEnquiry.count({
        where: {
          followUpDate: { lte: new Date() },
          status: { notIn: ["ADMITTED", "REJECTED"] },
        },
      }),
    ]);
    const byStatus: Record<string, number> = {};
    groups.forEach((g) => {
      byStatus[g.status] = g._count._all;
    });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const admitted = byStatus.ADMITTED ?? 0;
    ok(res, {
      total,
      byStatus,
      followUpsDue,
      conversionRate: total ? Math.round((admitted / total) * 1000) / 10 : 0,
    });
  }),
);

// ---- One enquiry (also used to pre-fill the admission form) ----
enquiriesRouter.get(
  "/:id",
  authorize("enquiries", "VIEW"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const row = await prisma.admissionEnquiry.findUnique({
      where: { id: req.params.id },
      include: classInclude,
    });
    if (!row) throw ApiError.notFound("Enquiry not found");
    ok(res, row);
  }),
);

// ---- Create ----
enquiriesRouter.post(
  "/",
  authorize("enquiries", "CREATE"),
  validate(createEnquirySchema),
  h(async (req, res) => {
    const row = await prisma.$transaction(async (tx) => {
      const year = req.body.enquiryDate.getFullYear();
      const n = await nextSequence(tx, `ENQ-${year}`);
      return tx.admissionEnquiry.create({
        data: { ...req.body, enquiryNo: formatNumber("ENQ", year, n) },
      });
    });
    await writeAudit(req, {
      action: "ENQUIRY_CREATED",
      entity: "admission_enquiries",
      entityId: row.id,
    });
    ok(res, row, 201);
  }),
);

// ---- Update details ----
enquiriesRouter.put(
  "/:id",
  authorize("enquiries", "EDIT"),
  validate(idParam, "params"),
  validate(updateEnquirySchema),
  h(async (req, res) => {
    const found = await prisma.admissionEnquiry.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Enquiry not found");
    if (found.status === "ADMITTED")
      throw ApiError.conflict(
        "This enquiry was converted to an admission and is locked",
      );
    ok(
      res,
      await prisma.admissionEnquiry.update({
        where: { id: found.id },
        data: req.body,
      }),
    );
  }),
);

// ---- Change status / schedule follow-up ----
enquiriesRouter.patch(
  "/:id/status",
  authorize("enquiries", "EDIT"),
  validate(idParam, "params"),
  validate(statusSchema),
  h(async (req, res) => {
    const found = await prisma.admissionEnquiry.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Enquiry not found");
    if (found.status === "ADMITTED")
      throw ApiError.conflict(
        "This enquiry was converted to an admission and is locked",
      );
    const { status, followUpDate, remarks } = req.body;
    ok(
      res,
      await prisma.admissionEnquiry.update({
        where: { id: found.id },
        data: {
          status,
          ...(followUpDate && { followUpDate }),
          ...(remarks && { remarks }),
        },
      }),
    );
  }),
);

// ---- Delete (not allowed once admitted) ----
enquiriesRouter.delete(
  "/:id",
  authorize("enquiries", "DELETE"),
  validate(idParam, "params"),
  h(async (req, res) => {
    const found = await prisma.admissionEnquiry.findUnique({
      where: { id: req.params.id },
    });
    if (!found) throw ApiError.notFound("Enquiry not found");
    if (found.status === "ADMITTED")
      throw ApiError.conflict("Admitted enquiries cannot be deleted");
    await prisma.admissionEnquiry.delete({ where: { id: found.id } });
    await writeAudit(req, {
      action: "ENQUIRY_DELETED",
      entity: "admission_enquiries",
      entityId: found.id,
      oldValues: found,
    });
    ok(res, { id: found.id });
  }),
);

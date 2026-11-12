import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { formatNumber } from "../../utils/sequence";
import {
  applyDiscounts,
  computeFine,
  DiscountRule,
  Line,
  periodDueDate,
  periodOverlapsSession,
  sumDecimals,
  ZERO,
} from "./invoices.calc";
import { effectiveItems, structureInclude } from "./fees.helpers";
import type { GenerateInput } from "./invoices.schema";

interface Draft {
  enrollmentId: string;
  studentId: string;
  classId: string;
  sectionId: string;
  needsAssign: boolean;
  structureId: string;
  admissionNo: string;
  fullName: string;
  className: string;
  sectionName: string;
  dueDate: Date;
  fineType: "NONE" | "FIXED" | "PER_DAY";
  fineRate: Prisma.Decimal;
  graceDays: number;
  lines: Line[];
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  fineAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  previousBalance: Prisma.Decimal;
}
interface Skipped {
  enrollmentId: string;
  admissionNo: string;
  fullName: string;
  reason: string;
}

/** Plans invoices for a month. With dryRun nothing is written; otherwise everything is written in one transaction. */
export async function generateInvoices(input: GenerateInput, userId: string) {
  const session = await prisma.academicSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session) throw ApiError.notFound("Academic session not found");
  if (
    !periodOverlapsSession(input.periodKey, session.startDate, session.endDate)
  ) {
    throw ApiError.badRequest(
      `${input.periodKey} is outside session ${session.name}`,
    );
  }

  const issueDate = new Date(new Date().toISOString().slice(0, 10)); // today, UTC date
  const { sessionId, periodKey } = input;

  try {
    return await prisma.$transaction(
      async (tx) => {
        const enrollments = await tx.enrollment.findMany({
          where: {
            sessionId,
            status: "ENROLLED",
            student: { status: "ACTIVE", archivedAt: null },
            ...(input.enrollmentIds?.length
              ? { id: { in: input.enrollmentIds } }
              : {
                  classId: input.classId!,
                  ...(input.sectionId && { sectionId: input.sectionId }),
                }),
          },
          orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
          include: {
            student: {
              select: { id: true, admissionNo: true, fullName: true },
            },
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
            feeAssignment: {
              include: {
                overrides: true,
                structure: { include: structureInclude },
              },
            },
          },
        });
        if (enrollments.length === 0)
          throw ApiError.conflict(
            "No enrolled students found for this selection",
          );

        const ids = enrollments.map((e) => e.id);
        const studentIds = enrollments.map((e) => e.studentId);
        const classIds = [...new Set(enrollments.map((e) => e.classId))];

        const [classStructures, existing, billed, discounts, openInvoices] =
          await Promise.all([
            tx.feeStructure.findMany({
              where: { sessionId, classId: { in: classIds } },
              include: structureInclude,
            }),
            tx.feeInvoice.findMany({
              where: {
                enrollmentId: { in: ids },
                periodKey,
                status: { not: "CANCELLED" },
              },
              select: { enrollmentId: true },
            }),
            tx.feeInvoiceItem.findMany({
              where: {
                frequency: { in: ["ONE_TIME", "YEARLY"] },
                invoice: {
                  status: { not: "CANCELLED" },
                  studentId: { in: studentIds },
                },
              },
              select: {
                categoryId: true,
                frequency: true,
                invoice: { select: { studentId: true, enrollmentId: true } },
              },
            }),
            tx.feeDiscount.findMany({
              where: { enrollmentId: { in: ids }, status: "APPROVED" },
              orderBy: { createdAt: "asc" },
            }),
            tx.feeInvoice.findMany({
              where: {
                studentId: { in: studentIds },
                status: { in: ["OPEN", "PARTIAL"] },
                periodKey: { lt: periodKey },
              },
              select: { studentId: true, totalAmount: true, paidAmount: true },
            }),
          ]);

        const structureByClass = new Map(
          classStructures.map((s) => [s.classId, s]),
        );
        const alreadyInvoiced = new Set(existing.map((x) => x.enrollmentId));
        const oneTimeDone = new Set(
          billed
            .filter((b) => b.frequency === "ONE_TIME")
            .map((b) => `${b.invoice.studentId}:${b.categoryId}`),
        );
        const yearlyDone = new Set(
          billed
            .filter((b) => b.frequency === "YEARLY")
            .map((b) => `${b.invoice.enrollmentId}:${b.categoryId}`),
        );

        const rulesByEnrollment = new Map<string, DiscountRule[]>();
        discounts.forEach((d) => {
          const list = rulesByEnrollment.get(d.enrollmentId) ?? [];
          list.push({
            mode: d.mode,
            value: d.value,
            categoryId: d.categoryId,
            validFromPeriod: d.validFromPeriod,
            validToPeriod: d.validToPeriod,
          });
          rulesByEnrollment.set(d.enrollmentId, list);
        });

        const previousByStudent = new Map<string, Prisma.Decimal>();
        openInvoices.forEach((i) => {
          previousByStudent.set(
            i.studentId,
            (previousByStudent.get(i.studentId) ?? ZERO).plus(
              i.totalAmount.minus(i.paidAmount),
            ),
          );
        });

        // ---------- Plan ----------
        const drafts: Draft[] = [];
        const skipped: Skipped[] = [];

        for (const e of enrollments) {
          const skip = (reason: string) =>
            skipped.push({
              enrollmentId: e.id,
              admissionNo: e.student.admissionNo,
              fullName: e.student.fullName,
              reason,
            });

          if (alreadyInvoiced.has(e.id)) {
            skip("Already generated for this month");
            continue;
          }

          const a = e.feeAssignment;
          let structure = a?.structure ?? structureByClass.get(e.classId);
          if (a && a.structure.classId !== e.classId) {
            skip("Class changed: reassign fees first");
            continue;
          }
          if (!structure) {
            skip("No fee structure for this class");
            continue;
          }

          const lines: Line[] = [];
          for (const it of effectiveItems(
            structure.items,
            a?.overrides ?? [],
          )) {
            if (it.amount.lte(0)) continue;
            if (
              it.frequency === "ONE_TIME" &&
              (!input.includeOneTime ||
                oneTimeDone.has(`${e.studentId}:${it.categoryId}`))
            )
              continue;
            if (
              it.frequency === "YEARLY" &&
              (!input.includeOneTime ||
                yearlyDone.has(`${e.id}:${it.categoryId}`))
            )
              continue;
            lines.push({
              categoryId: it.categoryId,
              description: it.name,
              frequency: it.frequency,
              amount: it.amount,
              discount: ZERO,
            });
          }
          if (lines.length === 0) {
            skip("Nothing to charge this month");
            continue;
          }

          const priced = applyDiscounts(
            lines,
            rulesByEnrollment.get(e.id) ?? [],
            periodKey,
          );
          const subtotal = sumDecimals(priced.map((l) => l.amount));
          const discountTotal = sumDecimals(priced.map((l) => l.discount));
          const dueDate = periodDueDate(periodKey, structure.dueDay);
          const fineAmount = computeFine(
            {
              fineType: structure.fineType,
              fineRate: structure.fineAmount,
              graceDays: structure.graceDays,
              dueDate,
            },
            issueDate,
          );

          drafts.push({
            enrollmentId: e.id,
            studentId: e.studentId,
            classId: e.classId,
            sectionId: e.sectionId,
            needsAssign: !a,
            structureId: structure.id,
            admissionNo: e.student.admissionNo,
            fullName: e.student.fullName,
            className: e.class.name,
            sectionName: e.section.name,
            dueDate,
            fineType: structure.fineType,
            fineRate: structure.fineAmount,
            graceDays: structure.graceDays,
            lines: priced,
            subtotal,
            discountTotal,
            fineAmount,
            totalAmount: subtotal.minus(discountTotal).plus(fineAmount),
            previousBalance: previousByStudent.get(e.studentId) ?? ZERO,
          });
        }

        const totals = {
          subtotal: sumDecimals(drafts.map((d) => d.subtotal)).toFixed(2),
          discountTotal: sumDecimals(
            drafts.map((d) => d.discountTotal),
          ).toFixed(2),
          fineAmount: sumDecimals(drafts.map((d) => d.fineAmount)).toFixed(2),
          totalAmount: sumDecimals(drafts.map((d) => d.totalAmount)).toFixed(2),
        };

        if (input.dryRun || drafts.length === 0) {
          return {
            dryRun: input.dryRun,
            created: 0,
            wouldCreate: drafts.length,
            skipped,
            totals,
            preview: drafts.map((d) => ({
              enrollmentId: d.enrollmentId,
              admissionNo: d.admissionNo,
              fullName: d.fullName,
              className: d.className,
              section: d.sectionName,
              itemCount: d.lines.length,
              subtotal: d.subtotal.toFixed(2),
              discountTotal: d.discountTotal.toFixed(2),
              fineAmount: d.fineAmount.toFixed(2),
              totalAmount: d.totalAmount.toFixed(2),
              previousBalance: d.previousBalance.toFixed(2),
            })),
          };
        }

        // ---------- Write ----------
        const year = issueDate.getUTCFullYear();
        const counterKey = `INV-${year}`;
        const counter = await tx.counter.upsert({
          where: { key: counterKey },
          create: { key: counterKey, value: drafts.length },
          update: { value: { increment: drafts.length } },
        });
        const firstNo = counter.value - drafts.length + 1;

        const toAssign = drafts.filter((d) => d.needsAssign);
        if (toAssign.length) {
          await tx.studentFeeAssignment.createMany({
            data: toAssign.map((d) => ({
              enrollmentId: d.enrollmentId,
              structureId: d.structureId,
            })),
            skipDuplicates: true,
          });
        }

        for (const [i, d] of drafts.entries()) {
          await tx.feeInvoice.create({
            data: {
              invoiceNo: formatNumber("INV", year, firstNo + i, 5),
              enrollmentId: d.enrollmentId,
              studentId: d.studentId,
              sessionId,
              classId: d.classId,
              sectionId: d.sectionId,
              periodKey,
              periodLock: `${d.enrollmentId}:${periodKey}`,
              issueDate,
              dueDate: d.dueDate,
              subtotal: d.subtotal,
              discountTotal: d.discountTotal,
              fineAmount: d.fineAmount,
              totalAmount: d.totalAmount,
              previousBalance: d.previousBalance,
              fineType: d.fineType,
              fineRate: d.fineRate,
              graceDays: d.graceDays,
              generatedById: userId,
              items: {
                create: d.lines.map((l) => ({
                  categoryId: l.categoryId,
                  description: l.description,
                  frequency: l.frequency,
                  amount: l.amount,
                  discount: l.discount,
                })),
              },
            },
          });
        }

        return {
          dryRun: false,
          created: drafts.length,
          wouldCreate: drafts.length,
          skipped,
          totals,
          preview: [],
        };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw ApiError.conflict(
        "Invoices for this month were just generated by someone else. Refresh and check the vouchers.",
      );
    }
    throw e;
  }
}

/** Recomputes late fines for unpaid invoices. Idempotent: a fine is set to what is owed, never added again, and never lowered. */
export async function applyLateFines(asOf: Date, sessionId?: string) {
  const invoices = await prisma.feeInvoice.findMany({
    where: {
      status: { in: ["OPEN", "PARTIAL"] },
      fineType: { not: "NONE" },
      dueDate: { lt: asOf },
      ...(sessionId && { sessionId }),
    },
    select: {
      id: true,
      fineType: true,
      fineRate: true,
      graceDays: true,
      dueDate: true,
      fineAmount: true,
      subtotal: true,
      discountTotal: true,
    },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let added = ZERO;
  for (const inv of invoices) {
    const fine = computeFine(inv, asOf);
    if (fine.gt(inv.fineAmount)) {
      added = added.plus(fine.minus(inv.fineAmount));
      ops.push(
        prisma.feeInvoice.update({
          where: { id: inv.id },
          data: {
            fineAmount: fine,
            totalAmount: inv.subtotal.minus(inv.discountTotal).plus(fine),
          },
        }),
      );
    }
  }
  if (ops.length) await prisma.$transaction(ops);
  return { updated: ops.length, fineAdded: added.toFixed(2) };
}

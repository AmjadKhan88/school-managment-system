import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { formatNumber, nextSequence } from "../../utils/sequence";
import type { InternalInput, OutInput } from "./transfers.schema";

const OPTS = { timeout: 20_000, maxWait: 10_000 };

async function loadActiveEnrollment(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  studentId: string,
  sessionId: string,
) {
  const enrollment = await tx.enrollment.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
    include: {
      student: { select: { fullName: true, status: true, archivedAt: true } },
    },
  });
  if (!enrollment)
    throw ApiError.notFound(
      "This student is not enrolled in the selected session",
    );
  if (enrollment.status !== "ENROLLED")
    throw ApiError.conflict(
      `This enrollment is already ${enrollment.status.toLowerCase()}`,
    );
  if (enrollment.student.status !== "ACTIVE" || enrollment.student.archivedAt)
    throw ApiError.conflict("The student is not active");
  return enrollment;
}

/** Move a student to another class/section inside the same session. The old placement is kept in the log. */
export function transferInternal(input: InternalInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await loadActiveEnrollment(
      tx,
      input.studentId,
      input.sessionId,
    );

    const [toClass, section] = await Promise.all([
      tx.class.findUnique({ where: { id: input.toClassId } }),
      tx.section.findUnique({ where: { id: input.toSectionId } }),
    ]);
    if (!toClass || !toClass.isActive)
      throw ApiError.badRequest("The target class is not available");
    if (!section || section.classId !== toClass.id)
      throw ApiError.badRequest(
        "That section does not belong to the selected class",
      );
    if (!section.isActive)
      throw ApiError.badRequest("That section is inactive");
    if (
      enrollment.classId === toClass.id &&
      enrollment.sectionId === section.id
    ) {
      throw ApiError.conflict(
        "The student is already in this class and section",
      );
    }

    const seated = await tx.enrollment.count({
      where: {
        sessionId: input.sessionId,
        sectionId: section.id,
        status: "ENROLLED",
      },
    });
    if (seated >= section.capacity)
      throw ApiError.conflict(
        `Section ${section.name} is full (${section.capacity} seats)`,
      );

    let rollNo = input.rollNo;
    if (rollNo) {
      const used = await tx.enrollment.findFirst({
        where: { sessionId: input.sessionId, sectionId: section.id, rollNo },
      });
      if (used)
        throw ApiError.conflict(
          `Roll number ${rollNo} is already taken in section ${section.name}`,
        );
    } else {
      const agg = await tx.enrollment.aggregate({
        where: { sessionId: input.sessionId, sectionId: section.id },
        _max: { rollNo: true },
      });
      rollNo = (agg._max.rollNo ?? 0) + 1;
    }

    const log = await tx.studentTransfer.create({
      data: {
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        sessionId: input.sessionId,
        type: "INTERNAL",
        fromClassId: enrollment.classId,
        fromSectionId: enrollment.sectionId,
        fromRollNo: enrollment.rollNo,
        toClassId: toClass.id,
        toSectionId: section.id,
        toRollNo: rollNo,
        transferDate: input.transferDate,
        reason: input.reason,
        performedById: userId,
      },
    });
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { classId: toClass.id, sectionId: section.id, rollNo },
    });
    return {
      id: log.id,
      studentName: enrollment.student.fullName,
      className: toClass.name,
      sectionName: section.name,
      rollNo,
    };
  }, OPTS);
}

/** Student leaves the school: status becomes Transferred and a leaving-certificate number is issued. */
export function transferOut(input: OutInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await loadActiveEnrollment(
      tx,
      input.studentId,
      input.sessionId,
    );

    const year = input.transferDate.getFullYear();
    const certificateNo = formatNumber(
      "TC",
      year,
      await nextSequence(tx, `TC-${year}`),
    );

    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "TRANSFERRED" },
    });
    await tx.student.update({
      where: { id: input.studentId },
      data: { status: "TRANSFERRED" },
    });
    const log = await tx.studentTransfer.create({
      data: {
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        sessionId: input.sessionId,
        type: "OUT",
        fromClassId: enrollment.classId,
        fromSectionId: enrollment.sectionId,
        fromRollNo: enrollment.rollNo,
        transferDate: input.transferDate,
        reason: input.reason,
        destinationSchool: input.destinationSchool,
        certificateNo,
        performedById: userId,
      },
    });
    return {
      id: log.id,
      studentName: enrollment.student.fullName,
      certificateNo,
    };
  }, OPTS);
}

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { formatNumber, nextSequence } from "../../utils/sequence";
import type { AdmissionInput } from "./admissions.schema";

/** Same name + father name + date of birth (case-insensitive). */
export function findDuplicates(
  fullName: string,
  fatherName: string,
  dateOfBirth: Date,
) {
  return prisma.student.findMany({
    where: {
      fullName: { equals: fullName, mode: "insensitive" },
      fatherName: { equals: fatherName, mode: "insensitive" },
      dateOfBirth,
    },
    select: {
      id: true,
      admissionNo: true,
      fullName: true,
      fatherName: true,
      dateOfBirth: true,
      status: true,
    },
  });
}

export async function createAdmission(input: AdmissionInput, userId: string) {
  const {
    student,
    guardians,
    placement,
    enquiryId,
    admissionRemarks,
    confirmDuplicate,
  } = input;
  const { sessionId, classId, sectionId } = placement;

  // ---- Checks that do not need a transaction ----
  if (
    student.bFormNo &&
    (await prisma.student.findUnique({ where: { bFormNo: student.bFormNo } }))
  ) {
    throw ApiError.conflict("A student with this B-Form number already exists");
  }
  if (!confirmDuplicate) {
    const duplicates = await findDuplicates(
      student.fullName,
      student.fatherName,
      student.dateOfBirth,
    );
    if (duplicates.length)
      throw new ApiError(409, "Possible duplicate student", { duplicates });
  }

  const [session, section] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: sessionId } }),
    prisma.section.findUnique({ where: { id: sectionId } }),
  ]);
  if (!session) throw ApiError.badRequest("Academic session not found");
  if (!section || section.classId !== classId)
    throw ApiError.badRequest(
      "That section does not belong to the selected class",
    );
  if (!section.isActive) throw ApiError.badRequest("That section is inactive");

  let enquiry = null;
  if (enquiryId) {
    enquiry = await prisma.admissionEnquiry.findUnique({
      where: { id: enquiryId },
    });
    if (!enquiry) throw ApiError.notFound("Enquiry not found");
    if (enquiry.status === "ADMITTED")
      throw ApiError.conflict(
        "This enquiry was already converted to an admission",
      );
  }

  // ---- Everything below succeeds or fails together ----
  return prisma.$transaction(async (tx) => {
    const seated = await tx.enrollment.count({
      where: { sessionId, sectionId, status: "ENROLLED" },
    });
    if (seated >= section.capacity) {
      throw ApiError.conflict(
        `Section ${section.name} is full (${section.capacity} seats)`,
      );
    }

    let rollNo = placement.rollNo;
    if (rollNo) {
      const used = await tx.enrollment.findFirst({
        where: { sessionId, sectionId, rollNo },
      });
      if (used)
        throw ApiError.conflict(
          `Roll number ${rollNo} is already taken in this section`,
        );
    } else {
      const agg = await tx.enrollment.aggregate({
        where: { sessionId, sectionId },
        _max: { rollNo: true },
      });
      rollNo = (agg._max.rollNo ?? 0) + 1;
    }

    const year = student.admissionDate.getFullYear();
    const admissionNo = formatNumber(
      "ADM",
      year,
      await nextSequence(tx, `ADM-${year}`),
    );
    const created = await tx.student.create({
      data: { ...student, admissionNo },
    });

    const hasPrimary = guardians.some((g) => g.isPrimary);
    for (const [i, g] of guardians.entries()) {
      let guardianId = g.guardianId;
      if (guardianId) {
        if (!(await tx.guardian.findUnique({ where: { id: guardianId } })))
          throw ApiError.badRequest("Guardian not found");
      } else {
        const newGuardian = await tx.guardian.create({
          data: {
            fullName: g.fullName!,
            phone: g.phone!,
            email: g.email,
            occupation: g.occupation,
          },
        });
        guardianId = newGuardian.id;
      }
      await tx.studentGuardian.create({
        data: {
          studentId: created.id,
          guardianId,
          relation: g.relation,
          isPrimary: g.isPrimary || (!hasPrimary && i === 0),
        },
      });
    }

    const enrollment = await tx.enrollment.create({
      data: {
        studentId: created.id,
        sessionId,
        classId,
        sectionId,
        rollNo,
      },
    });

    // Link the new student to the class fee structure, if one has been set up for this session.
    const feeStructure = await tx.feeStructure.findUnique({
      where: { sessionId_classId: { sessionId, classId } },
      select: { id: true },
    });
    if (feeStructure)
      await tx.studentFeeAssignment.create({
        data: { enrollmentId: enrollment.id, structureId: feeStructure.id },
      });

    const admission = await tx.admission.create({
      data: {
        studentId: created.id,
        sessionId,
        admittedById: userId,
        admissionDate: student.admissionDate,
        remarks: admissionRemarks,
      },
    });
    if (enquiry) {
      await tx.admissionEnquiry.update({
        where: { id: enquiry.id },
        data: { status: "ADMITTED", admissionId: admission.id },
      });
    }

    return tx.student.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        guardians: { include: { guardian: true } },
        enrollments: { include: { class: true, section: true, session: true } },
      },
    });
  });
}

import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type { ExecuteInput } from "./promotion.schema";

interface Problem {
  studentId: string;
  name: string;
  message: string;
}
interface SeatState {
  count: number;
  capacity: number;
  name: string;
  used: Set<number>;
  maxRoll: number;
}

export async function executePromotion(input: ExecuteInput, userId: string) {
  const { fromSessionId, toSessionId, items } = input;

  const [from, to] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: fromSessionId } }),
    prisma.academicSession.findUnique({ where: { id: toSessionId } }),
  ]);
  if (!from || !to) throw ApiError.badRequest("Academic session not found");
  if (to.startDate <= from.startDate)
    throw ApiError.badRequest(
      "The target session must start after the source session",
    );

  const batchId = randomUUID();

  return prisma.$transaction(
    async (tx) => {
      const studentIds = items.map((i) => i.studentId);

      const [enrollments, inTargetRows, classes] = await Promise.all([
        tx.enrollment.findMany({
          where: { sessionId: fromSessionId, studentId: { in: studentIds } },
          include: {
            class: true,
            student: {
              select: { fullName: true, status: true, archivedAt: true },
            },
          },
        }),
        tx.enrollment.findMany({
          where: { sessionId: toSessionId, studentId: { in: studentIds } },
          select: { studentId: true },
        }),
        tx.class.findMany(),
      ]);
      const byStudent = new Map(enrollments.map((e) => [e.studentId, e]));
      const inTarget = new Set(inTargetRows.map((r) => r.studentId));
      const classMap = new Map(classes.map((c) => [c.id, c]));

      const sectionIds = [
        ...new Set(
          items.map((i) => i.sectionId).filter((x): x is string => !!x),
        ),
      ];
      const sections = await tx.section.findMany({
        where: { id: { in: sectionIds } },
      });
      const sectionMap = new Map(sections.map((s) => [s.id, s]));

      // Seats and roll numbers in the target session, tracked while planning so a batch cannot overfill a section.
      const seats = new Map<string, SeatState>();
      const seatState = async (sectionId: string): Promise<SeatState> => {
        const cached = seats.get(sectionId);
        if (cached) return cached;
        const section = sectionMap.get(sectionId)!;
        const [count, rolls] = await Promise.all([
          tx.enrollment.count({
            where: { sessionId: toSessionId, sectionId, status: "ENROLLED" },
          }),
          tx.enrollment.findMany({
            where: { sessionId: toSessionId, sectionId },
            select: { rollNo: true },
          }),
        ]);
        const used = new Set(
          rolls.map((r) => r.rollNo).filter((n): n is number => n !== null),
        );
        const state = {
          count,
          capacity: section.capacity,
          name: section.name,
          used,
          maxRoll: Math.max(0, ...used),
        };
        seats.set(sectionId, state);
        return state;
      };

      // ---------- Pass 1: validate everything, collect all problems ----------
      const problems: Problem[] = [];
      const plan: {
        item: (typeof items)[number];
        enrollmentId: string;
        classId: string | null;
        sectionId: string | null;
        rollNo: number | null;
      }[] = [];

      for (const item of items) {
        const e = byStudent.get(item.studentId);
        const name = e?.student.fullName ?? item.studentId;
        const fail = (message: string) =>
          problems.push({ studentId: item.studentId, name, message });

        if (!e) {
          fail("Not enrolled in the source session");
          continue;
        }
        if (e.status !== "ENROLLED") {
          fail(`Already processed (${e.status.toLowerCase()})`);
          continue;
        }
        if (e.student.status !== "ACTIVE" || e.student.archivedAt) {
          fail("Student is not active");
          continue;
        }
        if (inTarget.has(item.studentId)) {
          fail("Already enrolled in the target session");
          continue;
        }

        if (item.outcome === "GRADUATED") {
          plan.push({
            item,
            enrollmentId: e.id,
            classId: null,
            sectionId: null,
            rollNo: null,
          });
          continue;
        }

        const targetClassId =
          item.outcome === "REPEATED" ? e.classId : item.classId;
        const targetClass = targetClassId
          ? classMap.get(targetClassId)
          : undefined;
        if (!targetClass) {
          fail("Choose the class to promote into");
          continue;
        }
        if (item.outcome === "PROMOTED" && targetClass.level <= e.class.level) {
          fail(
            `${targetClass.name} is not a higher class than ${e.class.name}`,
          );
          continue;
        }

        const section = item.sectionId
          ? sectionMap.get(item.sectionId)
          : undefined;
        if (!section) {
          fail("Choose the target section");
          continue;
        }
        if (section.classId !== targetClass.id) {
          fail(
            `Section ${section.name} does not belong to ${targetClass.name}`,
          );
          continue;
        }
        if (!section.isActive) {
          fail(`Section ${section.name} is inactive`);
          continue;
        }

        const seat = await seatState(section.id);
        if (seat.count + 1 > seat.capacity) {
          fail(`Section ${seat.name} is full (${seat.capacity} seats)`);
          continue;
        }

        let rollNo = item.rollNo;
        if (rollNo) {
          if (seat.used.has(rollNo)) {
            fail(
              `Roll number ${rollNo} is already taken in section ${seat.name}`,
            );
            continue;
          }
        } else {
          rollNo = seat.maxRoll + 1;
          while (seat.used.has(rollNo)) rollNo++;
        }
        seat.used.add(rollNo);
        seat.maxRoll = Math.max(seat.maxRoll, rollNo);
        seat.count++;

        plan.push({
          item,
          enrollmentId: e.id,
          classId: targetClass.id,
          sectionId: section.id,
          rollNo,
        });
      }

      if (problems.length > 0)
        throw new ApiError(
          409,
          "Some students could not be promoted. Nothing was saved.",
          { errors: problems },
        );

      // ---------- Pass 2: write. Old enrollments keep their class, section and roll number. ----------
      const summary = { promoted: 0, repeated: 0, graduated: 0 };
      for (const p of plan) {
        const { item } = p;
        await tx.enrollment.update({
          where: { id: p.enrollmentId },
          data: { status: item.outcome },
        });

        let toEnrollmentId: string | null = null;
        if (item.outcome === "GRADUATED") {
          await tx.student.update({
            where: { id: item.studentId },
            data: { status: "PASSED_OUT" },
          });
          summary.graduated++;
        } else {
          const created = await tx.enrollment.create({
            data: {
              studentId: item.studentId,
              sessionId: toSessionId,
              classId: p.classId!,
              sectionId: p.sectionId!,
              rollNo: p.rollNo,
            },
          });
          toEnrollmentId = created.id;
          if (item.outcome === "PROMOTED") summary.promoted++;
          else summary.repeated++;
        }

        await tx.studentPromotion.create({
          data: {
            batchId,
            studentId: item.studentId,
            fromEnrollmentId: p.enrollmentId,
            toEnrollmentId,
            outcome: item.outcome,
            remarks: item.remarks,
            promotedById: userId,
          },
        });
      }

      return { batchId, total: plan.length, ...summary };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

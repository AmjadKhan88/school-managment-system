import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import { admissionSchema, duplicateQuerySchema } from "./admissions.schema";
import { createAdmission, findDuplicates } from "./admissions.service";

export const admissionsRouter = Router();

// Live duplicate check for the form (name + father name + date of birth)
admissionsRouter.get(
  "/duplicates",
  authorize("admissions", "CREATE"),
  validate(duplicateQuerySchema, "query"),
  h(async (req, res) => {
    const { fullName, fatherName, dateOfBirth } = req.query as unknown as {
      fullName: string;
      fatherName: string;
      dateOfBirth: Date;
    };
    ok(res, await findDuplicates(fullName, fatherName, dateOfBirth));
  }),
);

// Create student + guardians + enrollment + admission record (+ close the enquiry) in one transaction
admissionsRouter.post(
  "/",
  authorize("admissions", "CREATE"),
  validate(admissionSchema),
  h(async (req, res) => {
    const student = await createAdmission(req.body, req.user!.id);
    await writeAudit(req, {
      action: "STUDENT_ADMITTED",
      entity: "students",
      entityId: student.id,
      newValues: {
        admissionNo: student.admissionNo,
        fullName: student.fullName,
      },
    });
    ok(res, student, 201);
  }),
);

import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { ok } from "../../utils/respond";
import {
  cardsQuerySchema,
  CardsQuery,
  remarksSchema,
  RemarksInput,
} from "./reportcards.schema";
import { buildCards, saveRemarks } from "./reportcards.service";

export const reportCardsRouter = Router();

// All cards for a class, or one student with ?studentId. Used by the preview and the print page.
reportCardsRouter.get(
  "/class",
  authorize("results", "VIEW"),
  validate(cardsQuerySchema, "query"),
  h(async (req, res) => {
    const q = req.query as unknown as CardsQuery;
    const data = await buildCards(req.user!.schoolId, q.examId, q.classId, {
      studentId: q.studentId,
      sectionId: q.sectionId,
    });
    if (req.query.print === "1" || q.studentId) {
      await writeAudit(req, {
        action: "REPORT_CARDS_VIEWED",
        entity: "exam_results",
        entityId: q.examId,
        newValues: {
          classId: q.classId,
          studentId: q.studentId,
          cards: data.cards.length,
        },
      });
    }
    ok(res, data);
  }),
);

// Teacher remarks need results:EDIT, principal remarks need results:APPROVE. Checked per field in the service.
reportCardsRouter.put(
  "/remarks",
  authorize("results", "VIEW"),
  validate(remarksSchema),
  h(async (req, res) => {
    const b = req.body as RemarksInput;
    const perms = req.user!.permissions;
    const r = await saveRemarks(b, {
      id: req.user!.id,
      canTeacher: perms.has("results:EDIT"),
      canPrincipal: perms.has("results:APPROVE"),
    });
    if (r.updated > 0)
      await writeAudit(req, {
        action: "REPORT_CARD_REMARKS_SAVED",
        entity: "report_card_remarks",
        entityId: b.examId,
        newValues: { classId: b.classId, ...r },
      });
    ok(res, r);
  }),
);

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { listDefaulters } from "../fees/defaulters.service";
import { nextNo } from "../finance/finance.service";
import {
  extractVars,
  isEmail,
  joinNames,
  render,
  toDigits,
} from "./messages.calc";
import type {
  Audience,
  BatchListQuery,
  Channel,
  ComposeInput,
  LogListQuery,
  TemplateInput,
} from "./messages.schema";
import { configured, send } from "./providers";

const OPTS = { timeout: 30_000, maxWait: 10_000 };
const MAX_RECIPIENTS = 1000;
const LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
};
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const monthName = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const fmtAmount = (d: Prisma.Decimal) =>
  `Rs ${Number(d.toFixed(2)).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export const channelStatus = () => ({
  WHATSAPP: configured.WHATSAPP(),
  SMS: configured.SMS(),
  EMAIL: configured.EMAIL(),
});

// ---------------- Templates ----------------
export const listTemplates = () =>
  prisma.messageTemplate.findMany({ orderBy: { name: "asc" } });
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
export async function createTemplate(t: TemplateInput) {
  try {
    return await prisma.messageTemplate.create({
      data: { ...t, isActive: t.isActive ?? true },
    });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("A template with this name already exists");
    throw e;
  }
}
export async function updateTemplate(id: string, t: TemplateInput) {
  try {
    return await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...t,
        subject: t.subject ?? null,
        waTemplateName: t.waTemplateName ?? null,
      },
    });
  } catch (e) {
    if (isUnique(e))
      throw ApiError.conflict("A template with this name already exists");
    throw e;
  }
}

// ---------------- Who gets the message ----------------
interface Recipient {
  kind: "PARENT" | "EMPLOYEE";
  studentIds: string[];
  employeeId?: string;
  name: string;
  to: string;
  vars: Record<string, string>;
}
interface Skipped {
  name: string;
  reason: string;
}
type Fees = Map<string, { amount: Prisma.Decimal; months: string[] }>;

async function activeSessionId() {
  const s = await prisma.academicSession.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!s) throw ApiError.badRequest("There is no active academic session");
  return s.id;
}

/** One message per phone or email: a parent with several children gets a single message naming them all. */
async function parentRecipients(
  studentIds: string[],
  channel: Channel,
  school: string,
  fees?: Fees,
) {
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, status: "ACTIVE", archivedAt: null },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      enrollments: {
        orderBy: { session: { startDate: "desc" } },
        take: 1,
        select: { class: { select: { name: true } } },
      },
      guardians: {
        orderBy: { isPrimary: "desc" },
        take: 1,
        select: {
          guardian: { select: { fullName: true, phone: true, email: true } },
        },
      },
    },
  });
  const acc = new Map<
    string,
    {
      ids: string[];
      names: string[];
      className: string;
      parentName: string;
      amount: Prisma.Decimal;
      months: Set<string>;
    }
  >();
  const skipped: Skipped[] = [];
  for (const s of students) {
    const g = s.guardians[0]?.guardian;
    if (!g) {
      skipped.push({ name: s.fullName, reason: "No guardian recorded" });
      continue;
    }
    const to =
      channel === "EMAIL"
        ? g.email && isEmail(g.email.trim())
          ? g.email.trim().toLowerCase()
          : null
        : toDigits(g.phone);
    if (!to) {
      skipped.push({
        name: s.fullName,
        reason:
          channel === "EMAIL" ? "No email address" : "No valid phone number",
      });
      continue;
    }
    const f = fees?.get(s.id);
    const cur = acc.get(to);
    if (cur) {
      cur.ids.push(s.id);
      cur.names.push(s.fullName);
      if (f) {
        cur.amount = cur.amount.plus(f.amount);
        f.months.forEach((m) => cur.months.add(m));
      }
    } else {
      acc.set(to, {
        ids: [s.id],
        names: [s.fullName],
        className: s.enrollments[0]?.class.name ?? "",
        parentName: g.fullName,
        amount: f?.amount ?? new Prisma.Decimal(0),
        months: new Set(f?.months ?? []),
      });
    }
  }
  const recipients: Recipient[] = [...acc.entries()].map(([to, a]) => {
    const vars: Record<string, string> = {
      parent_name: a.parentName,
      student_name: joinNames(a.names),
      class_name: a.className,
      school_name: school,
    };
    if (fees) {
      vars.amount = fmtAmount(a.amount);
      vars.fee_month = [...a.months].sort().map(monthName).join(", ");
    }
    return {
      kind: "PARENT",
      studentIds: a.ids,
      name: `${a.parentName} (${joinNames(a.names)})`,
      to,
      vars,
    };
  });
  return { recipients, skipped };
}

async function staffRecipients(
  teachersOnly: boolean,
  channel: Channel,
  school: string,
) {
  const rows = await prisma.employee.findMany({
    where: { status: "ACTIVE", ...(teachersOnly && { isTeacher: true }) },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, phone: true, email: true },
  });
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  const skipped: Skipped[] = [];
  for (const e of rows) {
    const to =
      channel === "EMAIL"
        ? e.email && isEmail(e.email.trim())
          ? e.email.trim().toLowerCase()
          : null
        : toDigits(e.phone);
    if (!to) {
      skipped.push({
        name: e.fullName,
        reason:
          channel === "EMAIL" ? "No email address" : "No valid phone number",
      });
      continue;
    }
    if (seen.has(to)) continue;
    seen.add(to);
    recipients.push({
      kind: "EMPLOYEE",
      studentIds: [],
      employeeId: e.id,
      name: e.fullName,
      to,
      vars: {
        staff_name: e.fullName,
        parent_name: e.fullName,
        school_name: school,
        student_name: "",
        class_name: "",
      },
    });
  }
  return { recipients, skipped };
}

async function resolveRecipients(
  a: Audience,
  channel: Channel,
  school: string,
) {
  switch (a.type) {
    case "STAFF":
      return staffRecipients(a.teachersOnly, channel, school);
    case "PARENTS_ALL": {
      const rows = await prisma.student.findMany({
        where: { status: "ACTIVE", archivedAt: null },
        select: { id: true },
        take: 5000,
      });
      return parentRecipients(
        rows.map((r) => r.id),
        channel,
        school,
      );
    }
    case "PARENTS_CLASS": {
      const sessionId = await activeSessionId();
      const rows = await prisma.enrollment.findMany({
        where: {
          sessionId,
          classId: a.classId,
          ...(a.sectionId && { sectionId: a.sectionId }),
          status: "ENROLLED",
          student: { status: "ACTIVE", archivedAt: null },
        },
        select: { studentId: true },
      });
      return parentRecipients(
        rows.map((r) => r.studentId),
        channel,
        school,
      );
    }
    case "DEFAULTERS": {
      const d = await listDefaulters(
        {
          classId: a.classId,
          sectionId: a.sectionId,
          minOutstanding: a.minOutstanding,
          sortBy: "name",
          page: 1,
          pageSize: 100,
        },
        { all: true },
      );
      const fees: Fees = new Map(
        d.items.map((i) => [
          i.studentId,
          { amount: new Prisma.Decimal(i.outstanding), months: i.months },
        ]),
      );
      return parentRecipients(
        d.items.map((i) => i.studentId),
        channel,
        school,
        fees,
      );
    }
  }
}

async function audienceLabel(a: Audience) {
  if (a.type === "PARENTS_ALL") return "All parents";
  if (a.type === "STAFF") return a.teachersOnly ? "Teachers" : "All staff";
  const cls = a.classId
    ? await prisma.class.findUnique({
        where: { id: a.classId },
        select: { name: true },
      })
    : null;
  if (a.type === "PARENTS_CLASS") return `Parents of ${cls?.name ?? "a class"}`;
  return `Fee defaulters${cls ? ` (${cls.name})` : ""}`;
}

const schoolName = async (schoolId: string) =>
  (
    await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    })
  )?.name ?? "School";

// ---------------- Preview and send ----------------
export async function preview(schoolId: string, input: ComposeInput) {
  const school = await schoolName(schoolId);
  const { recipients, skipped } = await resolveRecipients(
    input.audience,
    input.channel,
    school,
  );
  return {
    total: recipients.length,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 15),
    samples: recipients.slice(0, 3).map((r) => ({
      to: r.to,
      name: r.name,
      subject: input.subject ? render(input.subject, r.vars) : null,
      body: render(input.body, r.vars),
    })),
  };
}

const running = new Set<string>();

export async function sendMessages(
  schoolId: string,
  userId: string,
  input: ComposeInput,
) {
  if (input.channel !== "WHATSAPP" && !configured[input.channel]())
    throw ApiError.conflict(
      `${LABEL[input.channel]} is not set up on the server yet. Add its credentials to the server settings first.`,
    );
  const school = await schoolName(schoolId);
  const { recipients, skipped } = await resolveRecipients(
    input.audience,
    input.channel,
    school,
  );
  if (recipients.length === 0)
    throw ApiError.badRequest(
      "Nobody to send to. Everyone in this audience is missing a valid contact.",
    );
  if (recipients.length > MAX_RECIPIENTS)
    throw ApiError.badRequest(
      `That is ${recipients.length} recipients. The limit is ${MAX_RECIPIENTS} per send. Narrow the audience.`,
    );

  const template = input.templateId
    ? await prisma.messageTemplate.findFirst({
        where: { id: input.templateId, isActive: true },
      })
    : null;
  if (input.templateId && !template)
    throw ApiError.badRequest("That template is not available");
  const waName =
    input.channel === "WHATSAPP" ? (template?.waTemplateName ?? null) : null;
  const isFees = input.audience.type === "DEFAULTERS";
  const label = await audienceLabel(input.audience);

  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.messageBatch.create({
      data: {
        batchNo: await nextNo(tx, "MSG", todayUtc()),
        channel: input.channel,
        purpose: isFees ? "FEE_REMINDER" : "GENERAL",
        audienceLabel: label,
        templateId: template?.id ?? null,
        subject: input.subject ?? null,
        body: input.body,
        waTemplateName: waName,
        waLanguage: waName ? template!.waLanguage : null,
        total: recipients.length,
        skipped: skipped.length,
        createdById: userId,
      },
      select: { id: true, batchNo: true },
    });
    const vars = extractVars(input.body);
    await tx.messageLog.createMany({
      data: recipients.map((r) => ({
        batchId: b.id,
        channel: input.channel,
        studentId: r.studentIds[0] ?? null,
        employeeId: r.employeeId ?? null,
        recipientName: r.name,
        to: r.to,
        subject: input.subject ? render(input.subject, r.vars) : null,
        body: render(input.body, r.vars),
        waParams: waName ? vars.map((k) => r.vars[k] ?? "") : [],
      })),
    });
    // Keeps the "Reminded" column on the defaulters page accurate.
    if (isFees) {
      await tx.feeReminder.createMany({
        data: recipients.flatMap((r) =>
          r.studentIds.map((studentId) => ({
            studentId,
            phone: r.to,
            message: render(input.body, r.vars),
            sentById: userId,
          })),
        ),
      });
    }
    return b;
  }, OPTS);

  void processBatch(batch.id).catch(() => undefined); // sends in the background
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    total: recipients.length,
    skipped: skipped.length,
  };
}

/** Sends every queued or failed message of a batch, five at a time. */
export async function processBatch(batchId: string) {
  if (running.has(batchId)) return;
  running.add(batchId);
  try {
    const batch = await prisma.messageBatch.findUnique({
      where: { id: batchId },
      select: { channel: true, waTemplateName: true, waLanguage: true },
    });
    if (!batch) return;
    const logs = await prisma.messageLog.findMany({
      where: { batchId, status: { in: ["QUEUED", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      take: MAX_RECIPIENTS,
    });
    let next = 0;
    const worker = async () => {
      while (next < logs.length) {
        const log = logs[next++];
        const res = await send(batch.channel, {
          to: log.to,
          body: log.body,
          subject: log.subject ?? undefined,
          template: batch.waTemplateName
            ? {
                name: batch.waTemplateName,
                language: batch.waLanguage ?? "en",
                params: log.waParams,
              }
            : undefined,
        });
        await prisma.messageLog.update({
          where: { id: log.id },
          data: {
            status: res.status,
            provider: res.provider,
            providerMessageId: res.id ?? null,
            error: res.error ?? null,
            sentAt: res.status === "SENT" ? new Date() : null,
          },
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, logs.length) }, worker));
  } finally {
    running.delete(batchId);
  }
}

export async function retryBatch(batchId: string) {
  const b = await prisma.messageBatch.findUnique({
    where: { id: batchId },
    select: { channel: true },
  });
  if (!b) throw ApiError.notFound("Batch not found");
  if (running.has(batchId))
    throw ApiError.conflict("This batch is still being sent");
  if (b.channel !== "WHATSAPP" && !configured[b.channel]())
    throw ApiError.conflict(`${LABEL[b.channel]} is not set up on the server`);
  const n = await prisma.messageLog.count({
    where: { batchId, status: { in: ["QUEUED", "FAILED"] } },
  });
  if (n === 0) throw ApiError.conflict("Nothing to retry in this batch");
  void processBatch(batchId).catch(() => undefined);
  return { retrying: n };
}

/** For WhatsApp messages sent by hand: records that the person pressed send. */
export async function markSent(id: string) {
  const r = await prisma.messageLog.updateMany({
    where: { id, status: "MANUAL" },
    data: { status: "SENT", sentAt: new Date(), provider: "manual" },
  });
  if (r.count === 0)
    throw ApiError.conflict("Only prepared messages can be marked as sent");
  return { id };
}

// ---------------- History ----------------
export async function listBatches(q: BatchListQuery) {
  const where: Prisma.MessageBatchWhereInput = q.channel
    ? { channel: q.channel }
    : {};
  const [rows, total] = await prisma.$transaction([
    prisma.messageBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.messageBatch.count({ where }),
  ]);
  const groups = await prisma.messageLog.groupBy({
    by: ["batchId", "status"],
    _count: { _all: true },
    where: { batchId: { in: rows.map((r) => r.id) } },
  });
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map((b) => {
      const counts: Record<string, number> = {};
      groups
        .filter((g) => g.batchId === b.id)
        .forEach((g) => {
          counts[g.status] = g._count._all;
        });
      return {
        id: b.id,
        batchNo: b.batchNo,
        channel: b.channel,
        purpose: b.purpose,
        audienceLabel: b.audienceLabel,
        subject: b.subject,
        body: b.body,
        total: b.total,
        skipped: b.skipped,
        createdAt: b.createdAt,
        counts,
      };
    }),
  };
}

export async function listLogs(batchId: string, q: LogListQuery) {
  const where: Prisma.MessageLogWhereInput = {
    batchId,
    ...(q.status && { status: q.status }),
    ...(q.q && {
      OR: [
        { recipientName: { contains: q.q, mode: "insensitive" } },
        { to: { contains: q.q } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.messageLog.count({ where }),
  ]);
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map((l) => ({
      id: l.id,
      recipientName: l.recipientName,
      to: l.to,
      channel: l.channel,
      body: l.body,
      status: l.status,
      error: l.error,
      sentAt: l.sentAt,
      deliveredAt: l.deliveredAt,
      readAt: l.readAt,
    })),
  };
}

// ---------------- WhatsApp delivery receipts ----------------
const RANK: Record<string, number> = {
  QUEUED: 0,
  MANUAL: 0,
  FAILED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};
interface WaPayload {
  entry?: {
    changes?: {
      value?: {
        statuses?: {
          id: string;
          status: string;
          errors?: { title?: string; message?: string }[];
        }[];
      };
    }[];
  }[];
}

export async function applyWhatsAppStatuses(payload: unknown) {
  const statuses = ((payload as WaPayload).entry ?? []).flatMap((e) =>
    (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []),
  );
  for (const s of statuses) {
    const log = await prisma.messageLog.findUnique({
      where: { providerMessageId: s.id },
      select: { id: true, status: true },
    });
    if (!log) continue;
    const now = new Date();
    if (s.status === "failed") {
      if (RANK[log.status] >= 2) continue; // never overwrite a delivered message
      await prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          error:
            s.errors?.[0]?.message ??
            s.errors?.[0]?.title ??
            "WhatsApp could not deliver this message",
        },
      });
    } else if (s.status === "delivered" && RANK[log.status] < 2) {
      await prisma.messageLog.update({
        where: { id: log.id },
        data: { status: "DELIVERED", deliveredAt: now },
      });
    } else if (s.status === "read" && RANK[log.status] < 3) {
      await prisma.messageLog.update({
        where: { id: log.id },
        data: { status: "READ", readAt: now, deliveredAt: now },
      });
    }
  }
}

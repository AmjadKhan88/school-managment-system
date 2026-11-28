import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { nextNo } from "../finance/finance.service";
import { linkedStudents } from "../portal/portal.service";
import type {
  InboxQuery,
  NoticeInput,
  NoticeListQuery,
} from "./communication.schema";

const OPTS = { timeout: 30_000, maxWait: 10_000 };
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));

// ---------------- Staff side: write and manage ----------------
async function checkClasses(classIds: string[]) {
  const ids = [...new Set(classIds)];
  const n = await prisma.class.count({
    where: { id: { in: ids }, isActive: true },
  });
  if (n !== ids.length)
    throw ApiError.badRequest("One of the chosen classes is not available");
  return ids;
}

export async function createNotice(userId: string, input: NoticeInput) {
  const { classIds, ...data } = input;
  const ids = data.audience === "CLASS" ? await checkClasses(classIds) : [];
  return prisma.$transaction(
    async (tx) =>
      tx.notice.create({
        data: {
          ...data,
          noticeNo: await nextNo(tx, "NTC", todayUtc()),
          createdById: userId,
          classes: { create: ids.map((classId) => ({ classId })) },
        },
        select: { id: true, noticeNo: true },
      }),
    OPTS,
  );
}

export async function updateNotice(id: string, input: NoticeInput) {
  const n = await prisma.notice.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!n) throw ApiError.notFound("Notice not found");
  if (n.status === "ARCHIVED")
    throw ApiError.conflict("Archived notices cannot be edited");
  const { classIds, ...data } = input;
  const ids = data.audience === "CLASS" ? await checkClasses(classIds) : [];
  await prisma.$transaction(async (tx) => {
    await tx.notice.update({
      where: { id },
      data: { ...data, expiresOn: data.expiresOn ?? null },
    });
    await tx.noticeClass.deleteMany({ where: { noticeId: id } });
    if (ids.length)
      await tx.noticeClass.createMany({
        data: ids.map((classId) => ({ noticeId: id, classId })),
      });
  }, OPTS);
  return { id };
}

export async function publishNotice(id: string, userId: string) {
  const n = await prisma.notice.findUnique({
    where: { id },
    select: { expiresOn: true },
  });
  if (!n) throw ApiError.notFound("Notice not found");
  if (n.expiresOn && n.expiresOn < todayUtc())
    throw ApiError.badRequest("The expiry date has passed. Edit it first.");
  const r = await prisma.notice.updateMany({
    where: { id, status: "DRAFT" },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: userId,
    },
  });
  if (r.count === 0) throw ApiError.conflict("Only drafts can be published");
  return { id };
}

export async function archiveNotice(id: string, reason?: string) {
  const r = await prisma.notice.updateMany({
    where: { id, status: "PUBLISHED" },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archiveReason: reason ?? null,
    },
  });
  if (r.count === 0)
    throw ApiError.conflict("Only published notices can be archived");
  return { id };
}

export async function removeNotice(id: string) {
  const r = await prisma.notice.deleteMany({ where: { id, status: "DRAFT" } });
  if (r.count === 0)
    throw ApiError.conflict(
      "Only drafts can be deleted. Archive a published notice instead.",
    );
  return { id };
}

const listInclude = {
  classes: { select: { classId: true, class: { select: { name: true } } } },
  _count: { select: { reads: true } },
} satisfies Prisma.NoticeInclude;
type Row = Prisma.NoticeGetPayload<{ include: typeof listInclude }>;
const shape = (n: Row) => ({
  id: n.id,
  noticeNo: n.noticeNo,
  kind: n.kind,
  title: n.title,
  body: n.body,
  audience: n.audience,
  status: n.status,
  isPinned: n.isPinned,
  publishedAt: n.publishedAt,
  expiresOn: n.expiresOn,
  archivedAt: n.archivedAt,
  archiveReason: n.archiveReason,
  createdAt: n.createdAt,
  classes: n.classes.map((c) => ({ id: c.classId, name: c.class.name })),
  reads: n._count.reads,
});

export async function listNotices(q: NoticeListQuery) {
  const where: Prisma.NoticeWhereInput = {
    ...(q.kind && { kind: q.kind }),
    ...(q.status && { status: q.status }),
    ...(q.q && {
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { noticeNo: { contains: q.q, mode: "insensitive" } },
        { body: { contains: q.q, mode: "insensitive" } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.notice.findMany({
      where,
      include: listInclude,
      orderBy: [{ createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.notice.count({ where }),
  ]);
  return { page: q.page, pageSize: q.pageSize, total, items: rows.map(shape) };
}

export const activeClasses = () =>
  prisma.class.findMany({
    where: { isActive: true },
    orderBy: { level: "asc" },
    select: { id: true, name: true },
  });

// ---------------- Reader side: staff, parents and students ----------------
async function audienceOf(userId: string) {
  const [student, guardian, kids] = await Promise.all([
    prisma.student.findFirst({
      where: { userId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    }),
    prisma.guardian.findFirst({ where: { userId }, select: { id: true } }),
    linkedStudents(userId),
  ]);
  const classIds = [
    ...new Set(
      kids.map((k) => k.enrollment?.classId).filter((x): x is string => !!x),
    ),
  ];
  return {
    isStudent: !!student,
    isParent: !!guardian,
    isStaff: !student && !guardian,
    classIds,
  };
}

/** What this person may read: published, not expired, and meant for them. */
function visibleTo(
  a: Awaited<ReturnType<typeof audienceOf>>,
): Prisma.NoticeWhereInput {
  const aud: ("ALL" | "PARENTS" | "STUDENTS" | "STAFF")[] = ["ALL"];
  if (a.isParent) aud.push("PARENTS");
  if (a.isStudent) aud.push("STUDENTS");
  if (a.isStaff) aud.push("STAFF");
  return {
    status: "PUBLISHED",
    AND: [
      { OR: [{ expiresOn: null }, { expiresOn: { gte: todayUtc() } }] },
      {
        OR: [
          { audience: { in: aud } },
          ...(a.classIds.length
            ? [
                {
                  audience: "CLASS" as const,
                  classes: { some: { classId: { in: a.classIds } } },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

const inboxShape = (n: {
  id: string;
  noticeNo: string;
  kind: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: Date | null;
  expiresOn: Date | null;
  reads: { readAt: Date }[];
}) => ({
  id: n.id,
  noticeNo: n.noticeNo,
  kind: n.kind,
  title: n.title,
  body: n.body,
  isPinned: n.isPinned,
  publishedAt: n.publishedAt,
  expiresOn: n.expiresOn,
  read: n.reads.length > 0,
});

export async function inbox(userId: string, q: InboxQuery) {
  const a = await audienceOf(userId);
  const where: Prisma.NoticeWhereInput = {
    AND: [
      visibleTo(a),
      {
        ...(q.kind && { kind: q.kind }),
        ...(q.unread && { reads: { none: { userId } } }),
      },
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.notice.findMany({
      where,
      include: { reads: { where: { userId }, select: { readAt: true } } },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.notice.count({ where }),
  ]);
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map(inboxShape),
  };
}

export async function unreadCount(userId: string) {
  const a = await audienceOf(userId);
  return {
    count: await prisma.notice.count({
      where: { AND: [visibleTo(a), { reads: { none: { userId } } }] },
    }),
  };
}

export async function markRead(userId: string, id: string) {
  const a = await audienceOf(userId);
  const n = await prisma.notice.findFirst({
    where: { AND: [visibleTo(a), { id }] },
    select: { id: true },
  });
  if (!n) throw ApiError.notFound("Notice not found");
  await prisma.noticeRead.upsert({
    where: { noticeId_userId: { noticeId: id, userId } },
    create: { noticeId: id, userId },
    update: {},
  });
  return { id };
}

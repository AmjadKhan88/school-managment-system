-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('NOTICE', 'CIRCULAR', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('ALL', 'PARENTS', 'STUDENTS', 'STAFF', 'CLASS');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "noticeNo" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL DEFAULT 'ALL',
    "status" "NoticeStatus" NOT NULL DEFAULT 'DRAFT',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "expiresOn" DATE,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdById" TEXT,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_classes" (
    "noticeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "notice_classes_pkey" PRIMARY KEY ("noticeId","classId")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("noticeId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "notices_noticeNo_key" ON "notices"("noticeNo");

-- CreateIndex
CREATE INDEX "notices_status_publishedAt_idx" ON "notices"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "notices_kind_status_idx" ON "notices"("kind", "status");

-- CreateIndex
CREATE INDEX "notice_reads_userId_idx" ON "notice_reads"("userId");

-- AddForeignKey
ALTER TABLE "notice_classes" ADD CONSTRAINT "notice_classes_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_classes" ADD CONSTRAINT "notice_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('INTERNAL', 'OUT');

-- CreateTable
CREATE TABLE "student_transfers" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "TransferType" NOT NULL,
    "fromClassId" TEXT NOT NULL,
    "fromSectionId" TEXT NOT NULL,
    "fromRollNo" INTEGER,
    "toClassId" TEXT,
    "toSectionId" TEXT,
    "toRollNo" INTEGER,
    "transferDate" DATE NOT NULL,
    "reason" TEXT,
    "destinationSchool" TEXT,
    "certificateNo" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_transfers_certificateNo_key" ON "student_transfers"("certificateNo");

-- CreateIndex
CREATE INDEX "student_transfers_studentId_idx" ON "student_transfers"("studentId");

-- CreateIndex
CREATE INDEX "student_transfers_sessionId_type_idx" ON "student_transfers"("sessionId", "type");

-- AddForeignKey
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

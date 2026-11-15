-- CreateEnum
CREATE TYPE "LeaveApplicantType" AS ENUM ('STUDENT', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('SICK', 'CASUAL', 'EMERGENCY', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "leave_applications" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "applicantType" "LeaveApplicantType" NOT NULL DEFAULT 'STUDENT',
    "studentId" TEXT,
    "employeeId" TEXT,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "documentName" TEXT,
    "documentStoredName" TEXT,
    "documentMime" TEXT,
    "documentSize" INTEGER,
    "submittedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_applications_applicationNo_key" ON "leave_applications"("applicationNo");

-- CreateIndex
CREATE UNIQUE INDEX "leave_applications_documentStoredName_key" ON "leave_applications"("documentStoredName");

-- CreateIndex
CREATE INDEX "leave_applications_studentId_status_startDate_idx" ON "leave_applications"("studentId", "status", "startDate");

-- CreateIndex
CREATE INDEX "leave_applications_status_idx" ON "leave_applications"("status");

-- CreateIndex
CREATE INDEX "leave_applications_startDate_endDate_idx" ON "leave_applications"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

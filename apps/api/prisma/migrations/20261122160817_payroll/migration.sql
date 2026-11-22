-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "PayrollItemKind" AS ENUM ('BASIC', 'ALLOWANCE', 'BONUS', 'OVERTIME', 'DEDUCTION', 'LOAN', 'ABSENCE');

-- CreateEnum
CREATE TYPE "SalaryPayMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('ADVANCE', 'LOAN');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'ACTIVE', 'SETTLED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "isPercent" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "slipNo" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "basicSalary" DECIMAL(14,2) NOT NULL,
    "allowancesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonusNote" TEXT,
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtimeRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductionsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loanRecovery" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "absenceDeduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "presentDays" INTEGER NOT NULL DEFAULT 0,
    "halfDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "paidLeaveDays" INTEGER NOT NULL DEFAULT 0,
    "unpaidLeaveDays" INTEGER NOT NULL DEFAULT 0,
    "uncoveredLeaveDays" INTEGER NOT NULL DEFAULT 0,
    "outsideDays" INTEGER NOT NULL DEFAULT 0,
    "recordedDays" INTEGER NOT NULL DEFAULT 0,
    "computedAbsenceDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "absenceDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "absenceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "absenceNote" TEXT,
    "generatedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "kind" "PayrollItemKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "loanId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "SalaryPayMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_loans" (
    "id" TEXT NOT NULL,
    "loanNo" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LoanType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "instalments" INTEGER NOT NULL,
    "instalmentAmount" DECIMAL(14,2) NOT NULL,
    "startPeriod" TEXT NOT NULL,
    "reason" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelReason" TEXT,
    "issuedOn" DATE,
    "issueMethod" "SalaryPayMethod",
    "issueReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_recoveries" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_name_key" ON "salary_components"("name");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_employeeId_componentId_key" ON "salary_structures"("employeeId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_slipNo_key" ON "payrolls"("slipNo");

-- CreateIndex
CREATE INDEX "payrolls_period_status_idx" ON "payrolls"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_employeeId_period_key" ON "payrolls"("employeeId", "period");

-- CreateIndex
CREATE INDEX "payroll_items_payrollId_idx" ON "payroll_items"("payrollId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_receiptNo_key" ON "salary_payments"("receiptNo");

-- CreateIndex
CREATE INDEX "salary_payments_paidOn_idx" ON "salary_payments"("paidOn");

-- CreateIndex
CREATE INDEX "salary_payments_payrollId_idx" ON "salary_payments"("payrollId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_loans_loanNo_key" ON "staff_loans"("loanNo");

-- CreateIndex
CREATE INDEX "staff_loans_employeeId_status_idx" ON "staff_loans"("employeeId", "status");

-- CreateIndex
CREATE INDEX "loan_recoveries_period_idx" ON "loan_recoveries"("period");

-- CreateIndex
CREATE UNIQUE INDEX "loan_recoveries_loanId_payrollId_key" ON "loan_recoveries"("loanId", "payrollId");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_recoveries" ADD CONSTRAINT "loan_recoveries_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "staff_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_recoveries" ADD CONSTRAINT "loan_recoveries_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

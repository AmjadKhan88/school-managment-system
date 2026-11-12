-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('FINE_WAIVER', 'EXTRA_DISCOUNT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "fee_adjustments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_refunds" (
    "id" TEXT NOT NULL,
    "refundNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_adjustments_invoiceId_idx" ON "fee_adjustments"("invoiceId");

-- CreateIndex
CREATE INDEX "fee_adjustments_studentId_idx" ON "fee_adjustments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_refunds_refundNo_key" ON "fee_refunds"("refundNo");

-- CreateIndex
CREATE INDEX "fee_refunds_studentId_idx" ON "fee_refunds"("studentId");

-- CreateIndex
CREATE INDEX "fee_refunds_status_idx" ON "fee_refunds"("status");

-- CreateIndex
CREATE INDEX "fee_refunds_paidDate_idx" ON "fee_refunds"("paidDate");

-- AddForeignKey
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

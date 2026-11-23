/*
  Warnings:

  - A unique constraint covering the columns `[expenseId]` on the table `salary_payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[payoutExpenseId]` on the table `staff_loans` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "salary_payments" ADD COLUMN     "expenseId" TEXT;

-- AlterTable
ALTER TABLE "staff_loans" ADD COLUMN     "payoutExpenseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_expenseId_key" ON "salary_payments"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_loans_payoutExpenseId_key" ON "staff_loans"("payoutExpenseId");

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_payoutExpenseId_fkey" FOREIGN KEY ("payoutExpenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

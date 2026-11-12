-- CreateTable
CREATE TABLE "fee_reminders" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_reminders_studentId_createdAt_idx" ON "fee_reminders"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "fee_reminders" ADD CONSTRAINT "fee_reminders_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

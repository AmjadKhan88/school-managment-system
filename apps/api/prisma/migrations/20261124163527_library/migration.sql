-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'LOST', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BorrowerType" AS ENUM ('STUDENT', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('ISSUED', 'RETURNED', 'LOST');

-- CreateEnum
CREATE TYPE "FineReason" AS ENUM ('OVERDUE', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('UNPAID', 'PAID', 'WAIVED');

-- CreateTable
CREATE TABLE "book_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "edition" TEXT,
    "publishedYear" INTEGER,
    "language" TEXT,
    "categoryId" TEXT NOT NULL,
    "shelfLocation" TEXT,
    "price" DECIMAL(14,2),
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copies" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "accessionNo" TEXT NOT NULL,
    "status" "CopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_issues" (
    "id" TEXT NOT NULL,
    "issueNo" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "borrowerType" "BorrowerType" NOT NULL,
    "studentId" TEXT,
    "employeeId" TEXT,
    "issuedOn" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "returnedOn" DATE,
    "status" "IssueStatus" NOT NULL DEFAULT 'ISSUED',
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "issuedById" TEXT,
    "returnedById" TEXT,
    "returnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fines" (
    "id" TEXT NOT NULL,
    "fineNo" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "borrowerType" "BorrowerType" NOT NULL,
    "studentId" TEXT,
    "employeeId" TEXT,
    "reason" "FineReason" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "FineStatus" NOT NULL DEFAULT 'UNPAID',
    "note" TEXT,
    "paidOn" DATE,
    "paymentMethod" "PaymentMethod",
    "receivedById" TEXT,
    "waivedById" TEXT,
    "waiveReason" TEXT,
    "incomeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_fines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_categories_name_key" ON "book_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_title_idx" ON "books"("title");

-- CreateIndex
CREATE INDEX "books_author_idx" ON "books"("author");

-- CreateIndex
CREATE INDEX "books_categoryId_idx" ON "books"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_accessionNo_key" ON "book_copies"("accessionNo");

-- CreateIndex
CREATE INDEX "book_copies_bookId_status_idx" ON "book_copies"("bookId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "library_issues_issueNo_key" ON "library_issues"("issueNo");

-- CreateIndex
CREATE INDEX "library_issues_studentId_status_idx" ON "library_issues"("studentId", "status");

-- CreateIndex
CREATE INDEX "library_issues_employeeId_status_idx" ON "library_issues"("employeeId", "status");

-- CreateIndex
CREATE INDEX "library_issues_status_dueDate_idx" ON "library_issues"("status", "dueDate");

-- CreateIndex
CREATE INDEX "library_issues_copyId_idx" ON "library_issues"("copyId");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_fineNo_key" ON "library_fines"("fineNo");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_incomeId_key" ON "library_fines"("incomeId");

-- CreateIndex
CREATE INDEX "library_fines_status_idx" ON "library_fines"("status");

-- CreateIndex
CREATE INDEX "library_fines_studentId_status_idx" ON "library_fines"("studentId", "status");

-- CreateIndex
CREATE INDEX "library_fines_employeeId_status_idx" ON "library_fines"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "book_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "library_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "other_income"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

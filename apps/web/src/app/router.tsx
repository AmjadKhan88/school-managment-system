import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import DashboardPage from "@/pages/DashboardPage";
import LoginPage from "@/pages/LoginPage";
import ModulePage from "@/pages/ModulePage";
import NotFoundPage from "@/pages/NotFoundPage";
import ReportsPage from "@/pages/ReportsPage";
import {
  ClassesPage,
  SectionsPage,
  SessionsPage,
  SubjectsPage,
} from "@/features/academics/pages";
import { ProtectedRoute } from "./ProtectedRoute";
import ClassSubjectsPage from "@/features/academics/ClassSubjectsPage";
import EnquiriesPage from "@/features/students/EnquiriesPage";
import AdmissionPage from "@/features/students/AdmissionPage";
import StudentsPage from "@/features/students/StudentsPage";
import StudentProfilePage from "@/features/students/StudentProfilePage";
import PromotionPage from "@/features/students/PromotionPage";
import PassedOutPage from "@/features/students/PassedOutPage";
import TransferPage from "@/features/students/TransferPage";
import CategoriesPage from "@/features/fees/CategoriesPage";
import FeeStructurePage from "@/features/fees/FeeStructurePage";
import AssignmentsPage from "@/features/fees/AssignmentsPage";
import GeneratePage from "@/features/fees/GeneratePage";
import VouchersPage from "@/features/fees/VouchersPage";
import DiscountsPage from "@/features/fees/DiscountsPage";
import CollectionPage from "@/features/fees/CollectionPage";
import PaymentsPage from "@/features/fees/PaymentsPage";
import DefaultersPage from "@/features/fees/DefaultersPage";
import ClassSummaryPage from "@/features/fees/ClassSummaryPage";
import AdjustmentsPage from "@/features/fees/AdjustmentsPage";
import RefundsPage from "@/features/fees/RefundsPage";
import DayWisePage from "@/features/fees/DayWisePage";
import ExpenseCategoriesPage from "@/features/finance/ExpenseCategoriesPage";
import ExpensesPage from "@/features/finance/ExpensesPage";
import IncomePage from "@/features/finance/IncomePage";
import CashBookPage from "@/features/finance/CashBookPage";
import IncomeVsExpensePage from "@/features/finance/IncomeVsExpensePage";
import ExpenseReportPage from "@/features/finance/ExpenseReportPage";
import AttendancePage from "@/features/attendance/AttendancePage";
import AttendanceReportsPage from "@/features/attendance/AttendanceReportsPage";
import LeavesPage from "@/features/attendance/LeavesPage";
import GradingPage from "@/features/exams/GradingPage";
import ExamsPage from "@/features/exams/ExamsPage";
import ExamSchedulePage from "@/features/exams/ExamSchedulePage";
import MarksEntryPage from "@/features/exams/MarksEntryPage";
import ClassResultsPage from "@/features/exams/ClassResultsPage";
import ReportCardsPage from "@/features/exams/ReportCardsPage";
import ReportCardPrintPage from "@/features/exams/ReportCardPrintPage";
import StaffPage from "@/features/staff/StaffPage";
import EmployeeProfilePage from "@/features/staff/EmployeeProfilePage";
import DesignationsPage from "@/features/staff/DesignationsPage";
import DepartmentsPage from "@/features/staff/DepartmentsPage";
import {
  ClassTeacherPage,
  TeacherAssignmentPage,
} from "@/features/staff/AssignmentPages";
import PasswordPage from "@/pages/PasswordPage";
import StaffAttendancePage from "@/features/staff/StaffAttendancePage";
import StaffLeavesPage from "@/features/staff/StaffLeavesPage";
import SalaryStructurePage from "@/features/payroll/SalaryStructurePage";
import SalaryManagementPage from "@/features/payroll/SalaryManagementPage";
import MonthlyPayrollPage from "@/features/payroll/MonthlyPayrollPage";
import SalaryPaymentsPage from "@/features/payroll/SalaryPaymentsPage";
import SalarySlipsPage from "@/features/payroll/SalarySlipsPage";
import SalarySlipPrintPage from "@/features/payroll/SalarySlipPrintPage";
import LoansPage from "@/features/payroll/LoansPage";
import PayrollReportsPage from "@/features/payroll/PayrollReportsPage";
import TimetablePage from "@/features/timetable/TimetablePage";
import TimetablePrintPage from "@/features/timetable/TimetablePrintPage";
import HomeworkPage from "@/features/homework/HomeworkPage";
import HomeworkDetailPage from "@/features/homework/HomeworkDetailPage";
import PortalHomeworkPage from "@/features/homework/PortalHomeworkPage";
import BooksPage from "@/features/library/BooksPage";
import LibraryCategoriesPage from "@/features/library/CategoriesPage";
import InventoryPage from "@/features/library/InventoryPage";
import IssuePage from "@/features/library/IssuePage";
import ReturnPage from "@/features/library/ReturnPage";
import OverduePage from "@/features/library/OverduePage";
import FinesPage from "@/features/library/FinesPage";
import LibraryReportsPage from "@/features/library/LibraryReportsPage";

// Routes already implemented; every other nav item falls back to ModulePage.
const implemented = new Set([
  "/dashboard",
  "/reports",
  "/academics/sessions",
  "/academics/classes",
  "/academics/sections",
  "/academics/subjects",
  "/academics/class-subjects",
  "/students/enquiries",
  "/students/new-admission",
  "/students/all",
  "/students/profile",
  "/students/promotion",
  "/students/archive",
  "/students/transfer",
  "/fees/categories",
  "/fees/structure",
  "/fees/class-setup",
  "/fees/assignments",
  "/fees/generate",
  "/fees/vouchers",
  "/fees/discounts",
  "/fees/scholarships",
  "/fees/collection",
  "/fees/quick-collect",
  "/fees/payments",
  "/fees/defaulters",
  "/fees/adjustments",
  "/fees/refunds",
  "/finance/expenses",
  "/finance/expense-categories",
  "/finance/income",
  "/finance/other-income",
  "/finance/cash-book",
  "/finance/bank",
  "/finance/income-vs-expense",
  "/attendance/students",
  "/attendance/reports",
  "/attendance/monthly",
  "/attendance/late",
  "/attendance/leaves",
  "/academics/grading",
  "/academics/exams",
  "/academics/exam-schedule",
  "/academics/marks",
  "/academics/results",
  "/academics/report-cards",
  "/staff/members",
  "/staff/teachers",
  "/staff/designations",
  "/staff/departments",
  "/academics/class-teachers",
  "/academics/teacher-assignments",
  "/account/password",
  "/attendance/teachers",
  "/attendance/staff",
  "/staff/attendance",
  "/staff/leaves",
  "/staff/salary-structure",
  "/staff/salary-management",
  "/staff/payroll",
  "/staff/salary-payments",
  "/staff/salary-slips",
  "/staff/advances",
  "/staff/loans",
  "/staff/payroll-reports",
  "/academics/timetable",
  "/academics/homework",
  "/library/books",
  "/library/categories",
  "/library/inventory",
  "/library/issue",
  "/library/return",
  "/library/overdue",
  "/library/fines",
  "/library/reports",
]);

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "reports/:slug", element: <ModulePage /> },
          { path: "academics/sessions", element: <SessionsPage /> },
          { path: "academics/classes", element: <ClassesPage /> },
          { path: "academics/sections", element: <SectionsPage /> },
          { path: "academics/subjects", element: <SubjectsPage /> },
          { path: "academics/class-subjects", element: <ClassSubjectsPage /> },
          { path: "students/enquiries", element: <EnquiriesPage /> },
          { path: "students/new-admission", element: <AdmissionPage /> },
          { path: "students/all", element: <StudentsPage /> },
          { path: "students/view/:id", element: <StudentProfilePage /> },
          {
            path: "students/profile",
            element: <Navigate to="/students/all" replace />,
          },
          { path: "students/promotion", element: <PromotionPage /> },
          { path: "students/archive", element: <PassedOutPage /> },
          { path: "students/transfer", element: <TransferPage /> },
          { path: "fees/categories", element: <CategoriesPage /> },
          { path: "fees/structure", element: <FeeStructurePage /> },
          { path: "fees/class-setup", element: <FeeStructurePage /> },
          { path: "fees/assignments", element: <AssignmentsPage /> },
          { path: "fees/generate", element: <GeneratePage /> },
          { path: "fees/vouchers", element: <VouchersPage /> },
          {
            path: "fees/discounts",
            element: <DiscountsPage kind="DISCOUNT" />,
          },
          {
            path: "fees/scholarships",
            element: <DiscountsPage kind="SCHOLARSHIP" />,
          },
          { path: "fees/collection", element: <CollectionPage /> },
          { path: "fees/quick-collect", element: <CollectionPage quick /> },
          { path: "fees/payments", element: <PaymentsPage /> },
          { path: "fees/defaulters", element: <DefaultersPage /> },
          { path: "reports/class-fee-summary", element: <ClassSummaryPage /> },
          { path: "fees/adjustments", element: <AdjustmentsPage /> },
          { path: "fees/refunds", element: <RefundsPage /> },
          { path: "finance/expenses", element: <ExpensesPage /> },
          {
            path: "finance/expense-categories",
            element: <ExpenseCategoriesPage />,
          },
          { path: "finance/income", element: <IncomePage /> },
          { path: "finance/other-income", element: <IncomePage /> },
          { path: "finance/cash-book", element: <CashBookPage /> },
          {
            path: "finance/bank",
            element: (
              <CashBookPage
                title="Bank Transactions"
                subtitle="Receipts and payments by bank transfer, JazzCash, EasyPaisa, cheque and other non-cash methods."
                lockedAccount="NON_CASH"
              />
            ),
          },
          {
            path: "finance/income-vs-expense",
            element: <IncomeVsExpensePage />,
          },
          { path: "reports/expenses", element: <ExpenseReportPage /> },
          { path: "attendance/students", element: <AttendancePage /> },
          {
            path: "attendance/reports",
            element: <AttendanceReportsPage key="daily" initial="daily" />,
          },
          {
            path: "attendance/monthly",
            element: <AttendanceReportsPage key="monthly" initial="monthly" />,
          },
          {
            path: "attendance/late",
            element: <AttendanceReportsPage key="late" initial="late" />,
          },
          { path: "attendance/leaves", element: <LeavesPage /> },
          { path: "academics/grading", element: <GradingPage /> },
          { path: "academics/exams", element: <ExamsPage /> },
          { path: "academics/exam-schedule", element: <ExamSchedulePage /> },
          { path: "academics/marks", element: <MarksEntryPage /> },
          { path: "academics/results", element: <ClassResultsPage /> },
          { path: "academics/report-cards", element: <ReportCardsPage /> },
          { path: "staff/members", element: <StaffPage key="all" /> },
          {
            path: "staff/teachers",
            element: <StaffPage key="teachers" teachersOnly />,
          },
          { path: "staff/view/:id", element: <EmployeeProfilePage /> },
          { path: "staff/designations", element: <DesignationsPage /> },
          { path: "staff/departments", element: <DepartmentsPage /> },
          { path: "academics/class-teachers", element: <ClassTeacherPage /> },
          {
            path: "academics/teacher-assignments",
            element: <TeacherAssignmentPage />,
          },
          { path: "account/password", element: <PasswordPage /> },
          {
            path: "attendance/teachers",
            element: <StaffAttendancePage key="teachers" group="teachers" />,
          },
          {
            path: "attendance/staff",
            element: <StaffAttendancePage key="staff" group="staff" />,
          },
          {
            path: "staff/attendance",
            element: <StaffAttendancePage key="staff2" group="staff" />,
          },
          { path: "staff/leaves", element: <StaffLeavesPage /> },
          { path: "staff/salary-structure", element: <SalaryStructurePage /> },
          {
            path: "staff/salary-management",
            element: <SalaryManagementPage />,
          },
          { path: "staff/payroll", element: <MonthlyPayrollPage /> },
          { path: "staff/salary-payments", element: <SalaryPaymentsPage /> },
          { path: "staff/salary-slips", element: <SalarySlipsPage /> },
          {
            path: "staff/advances",
            element: <LoansPage key="advance" type="ADVANCE" />,
          },
          {
            path: "staff/loans",
            element: <LoansPage key="loan" type="LOAN" />,
          },
          { path: "staff/payroll-reports", element: <PayrollReportsPage /> },
          { path: "academics/timetable", element: <TimetablePage /> },
          { path: "academics/homework", element: <HomeworkPage /> },
          { path: "academics/homework/:id", element: <HomeworkDetailPage /> },
          { path: "portal/homework", element: <PortalHomeworkPage /> },
          { path: "library/books", element: <BooksPage /> },
          { path: "library/categories", element: <LibraryCategoriesPage /> },
          { path: "library/inventory", element: <InventoryPage /> },
          { path: "library/issue", element: <IssuePage /> },
          { path: "library/return", element: <ReturnPage /> },
          { path: "library/overdue", element: <OverduePage /> },
          { path: "library/fines", element: <FinesPage /> },
          { path: "library/reports", element: <LibraryReportsPage /> },
          { path: "reports/day-wise-collection", element: <DayWisePage /> },
          ...ALL_NAV_ITEMS.filter(
            (i) => !i.action && !implemented.has(i.path),
          ).map((i) => ({ path: i.path.slice(1), element: <ModulePage /> })),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "print/report-cards", element: <ReportCardPrintPage /> },
      { path: "print/salary-slips", element: <SalarySlipPrintPage /> },
      { path: "print/timetable", element: <TimetablePrintPage /> },
    ],
  },
]);

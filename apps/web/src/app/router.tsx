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
          { path: "reports/day-wise-collection", element: <DayWisePage /> },
          ...ALL_NAV_ITEMS.filter(
            (i) => !i.action && !implemented.has(i.path),
          ).map((i) => ({ path: i.path.slice(1), element: <ModulePage /> })),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

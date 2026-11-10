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
          ...ALL_NAV_ITEMS.filter(
            (i) => !i.action && !implemented.has(i.path),
          ).map((i) => ({ path: i.path.slice(1), element: <ModulePage /> })),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

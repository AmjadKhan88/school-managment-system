import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  GraduationCap,
  School,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

// page: opens a screen. download: saves a file now. soon: needs a module that is not built yet.
export type ReportAction =
  | { kind: "page"; to: string }
  | {
      kind: "download";
      url: string;
      params?: () => Record<string, unknown>;
      file: string;
    }
  | { kind: "soon" };

export interface ReportCard {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tile: string; // icon tile colours
  highlight?: boolean; // amber "New" card
  action: ReportAction;
}

const firstOfMonth = () => new Date().toISOString().slice(0, 8) + "01";
const today = () => new Date().toISOString().slice(0, 10);

// Order matches the reference layout (2 columns, left to right).
export const REPORT_CARDS: ReportCard[] = [
  {
    slug: "class-fee-summary",
    title: "Class-wise Fee Summary",
    description: "Class-wise collection, pending and percentage in top right",
    icon: School,
    tile: "bg-teal-100 text-teal-700",
    action: { kind: "page", to: "/reports/class-fee-summary" },
  },
  {
    slug: "income-vs-expense",
    title: "Income vs Expense Report",
    description: "Income vs expense, monthly comparison with charts",
    icon: TrendingUp,
    tile: "bg-fuchsia-100 text-fuchsia-700",
    action: { kind: "soon" },
  },
  {
    slug: "fees-collected",
    title: "Fees Collected Report",
    description: "View all fee collections by date range, mode, class",
    icon: CircleDollarSign,
    tile: "bg-amber-100 text-amber-700",
    action: { kind: "page", to: "/fees/payments" },
  },
  {
    slug: "day-wise-collection",
    title: "Day-wise Collection Report",
    description:
      "Class-wise and student-wise collection for any date, with PDF print.",
    icon: CalendarDays,
    tile: "bg-rose-100 text-rose-600",
    highlight: true,
    action: { kind: "soon" },
  },
  {
    slug: "fee-defaulters",
    title: "Fee Defaulters Report",
    description: "Students with pending fee dues",
    icon: TriangleAlert,
    tile: "bg-red-100 text-red-600",
    action: { kind: "page", to: "/fees/defaulters" },
  },
  {
    slug: "session-students",
    title: "Session-wise Student Report",
    description: "Class, gender, stream wise student report with CSV export.",
    icon: GraduationCap,
    tile: "bg-sky-100 text-sky-700",
    action: { kind: "soon" },
  },
  {
    slug: "attendance",
    title: "Attendance Report",
    description: "Monthly attendance summary by class",
    icon: CalendarCheck,
    tile: "bg-emerald-100 text-emerald-700",
    action: { kind: "soon" },
  },
  {
    slug: "students-export",
    title: "Export Students (Excel)",
    description: "Download all student data as spreadsheet.",
    icon: BarChart3,
    tile: "bg-blue-100 text-blue-700",
    action: {
      kind: "download",
      url: "/reports/students/export",
      file: "students.xlsx",
    },
  },
  {
    slug: "fee-csv",
    title: "Export Fee CSV",
    description: "Download all fee transaction data",
    icon: ClipboardList,
    tile: "bg-yellow-100 text-yellow-700",
    action: {
      kind: "download",
      url: "/fees/payments/export",
      params: () => ({ format: "csv" }),
      file: "fee-transactions.csv",
    },
  },
  {
    slug: "expenses",
    title: "Expense Report",
    description: "View monthly school expenditure",
    icon: FileText,
    tile: "bg-orange-100 text-orange-700",
    action: { kind: "soon" },
  },
];

// Buttons in the "Export to Excel" panel. They download with default filters.
export interface QuickExport {
  label: string;
  action: ReportAction;
}
export const QUICK_EXPORTS: QuickExport[] = [
  {
    label: "Class-wise Fee Summary",
    action: {
      kind: "download",
      url: "/reports/class-fee-summary/export",
      file: "class-fee-summary.xlsx",
    },
  },
  { label: "Income vs Expense", action: { kind: "soon" } },
  {
    label: "Fees Collected",
    action: {
      kind: "download",
      url: "/fees/payments/export",
      params: () => ({ from: firstOfMonth(), to: today(), format: "xlsx" }),
      file: "fees-collected.xlsx",
    },
  },
  { label: "Day-wise Collection", action: { kind: "soon" } },
  {
    label: "Fee Defaulters",
    action: {
      kind: "download",
      url: "/fees/defaulters/export",
      file: "fee-defaulters.xlsx",
    },
  },
  { label: "Session-wise Students", action: { kind: "soon" } },
  { label: "Expense Report", action: { kind: "soon" } },
  {
    label: "All Students",
    action: {
      kind: "download",
      url: "/reports/students/export",
      file: "students.xlsx",
    },
  },
  {
    label: "All Fee Transactions",
    action: {
      kind: "download",
      url: "/fees/payments/export",
      params: () => ({ format: "xlsx" }),
      file: "fee-transactions.xlsx",
    },
  },
];

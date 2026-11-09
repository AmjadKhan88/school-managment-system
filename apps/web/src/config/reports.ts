import { BarChart3, CalendarCheck, CalendarDays, CircleDollarSign, ClipboardList, FileText, GraduationCap, School, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react';

export interface ReportCard {
  slug: string; title: string; description: string; icon: LucideIcon;
  tile: string;        // icon tile colours
  highlight?: boolean; // amber "New" card
}

// Order matches the reference layout (2 columns, left to right).
export const REPORT_CARDS: ReportCard[] = [
  { slug: 'class-fee-summary', title: 'Class-wise Fee Summary', description: 'Class-wise collection, pending and percentage in top right', icon: School, tile: 'bg-teal-100 text-teal-700' },
  { slug: 'income-vs-expense', title: 'Income vs Expense Report', description: 'Income vs expense, monthly comparison with charts', icon: TrendingUp, tile: 'bg-fuchsia-100 text-fuchsia-700' },
  { slug: 'fees-collected', title: 'Fees Collected Report', description: 'View all fee collections by date range, mode, class', icon: CircleDollarSign, tile: 'bg-amber-100 text-amber-700' },
  { slug: 'day-wise-collection', title: 'Day-wise Collection Report', description: 'Class-wise and student-wise collection for any date, with PDF print.', icon: CalendarDays, tile: 'bg-rose-100 text-rose-600', highlight: true },
  { slug: 'fee-defaulters', title: 'Fee Defaulters Report', description: 'Students with pending fee dues', icon: TriangleAlert, tile: 'bg-red-100 text-red-600' },
  { slug: 'session-students', title: 'Session-wise Student Report', description: 'Class, gender, stream wise student report with CSV export.', icon: GraduationCap, tile: 'bg-sky-100 text-sky-700' },
  { slug: 'attendance', title: 'Attendance Report', description: 'Monthly attendance summary by class', icon: CalendarCheck, tile: 'bg-emerald-100 text-emerald-700' },
  { slug: 'students-export', title: 'Export Students (Excel)', description: 'Download all student data as spreadsheet.', icon: BarChart3, tile: 'bg-blue-100 text-blue-700' },
  { slug: 'fee-csv', title: 'Export Fee CSV', description: 'Download all fee transaction data', icon: ClipboardList, tile: 'bg-yellow-100 text-yellow-700' },
  { slug: 'expenses', title: 'Expense Report', description: 'View monthly school expenditure', icon: FileText, tile: 'bg-orange-100 text-orange-700' },
];

export const QUICK_EXPORTS = [
  ['Class-wise Fee Summary', 'class-fee-summary'], ['Income vs Expense', 'income-vs-expense'], ['Fees Collected', 'fees-collected'],
  ['Day-wise Collection', 'day-wise-collection'], ['Fee Defaulters', 'fee-defaulters'], ['Session-wise Students', 'session-students'],
  ['Expense Report', 'expenses'], ['All Students', 'students-export'], ['All Fee Transactions', 'fee-csv'],
] as const;

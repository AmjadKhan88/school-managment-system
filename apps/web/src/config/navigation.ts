import type { IconName } from './icons';

export interface NavItem {
  label: string;
  path: string;          // route
  icon: IconName;
  module: string;        // permission module checked with VIEW
  phase: number;         // build phase that delivers it
  action?: 'logout';
}
export interface NavSection { id: string; title: string; items: NavItem[] }

type Row = [label: string, slug: string, icon: IconName, module?: string];
const section = (id: string, title: string, base: string, mod: string, phase: number, rows: Row[]): NavSection => ({
  id, title,
  items: rows.map(([label, slug, icon, m]) => ({ label, icon, module: m ?? mod, phase, path: `/${base}/${slug}` })),
});

export const NAVIGATION: NavSection[] = [
  { id: 'main', title: 'Main', items: [{ label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', module: 'dashboard', phase: 1 }] },

  section('students', 'Student Management', 'students', 'students', 2, [
    ['Admission Enquiry', 'enquiries', 'MessageSquarePlus', 'enquiries'],
    ['New Admission', 'new-admission', 'UserPlus', 'admissions'],
    ['All Students', 'all', 'Users'],
    ['Student Profile', 'profile', 'UserRound'],
    ['Passed Out Archive', 'archive', 'Archive'],
    ['Student Promotion', 'promotion', 'TrendingUp', 'promotion'],
    ['Student Transfer', 'transfer', 'ArrowRightLeft'],
    ['Student ID Cards', 'id-cards', 'Contact'],
    ['Student Documents', 'documents', 'FolderOpen'],
    ['Student Certificates', 'certificates', 'Award', 'certificates'],
    ['Alumni Management', 'alumni', 'GraduationCap', 'alumni'],
  ]),

  section('academics', 'Academic Management', 'academics', 'academics', 2, [
    ['Academic Sessions', 'sessions', 'CalendarRange'],
    ['Classes', 'classes', 'School'],
    ['Sections', 'sections', 'Layers'],
    ['Subjects', 'subjects', 'BookOpen'],
    ['Class-Subject Mapping', 'class-subjects', 'Network'],
    ['Class Teacher Assignment', 'class-teachers', 'UserCheck'],
    ['Teacher Assignment', 'teacher-assignments', 'Presentation'],
    ['Timetable', 'timetable', 'CalendarClock', 'timetable'],
    ['Exam Schedule', 'exam-schedule', 'ClipboardList', 'exams'],
    ['Exams', 'exams', 'FileText', 'exams'],
    ['Marks Entry', 'marks', 'PenLine', 'marks'],
    ['Class Results', 'results', 'Trophy', 'results'],
    ['Report Cards', 'report-cards', 'ScrollText', 'results'],
    ['Grading System', 'grading', 'Gauge'],
    ['Homework and Assignments', 'homework', 'NotebookPen', 'homework'],
    ['Lesson Planning', 'lesson-plans', 'ListChecks'],
    ['Academic Calendar', 'calendar', 'CalendarDays', 'calendar'],
  ]),

  section('attendance', 'Attendance', 'attendance', 'attendance', 4, [
    ['Student Attendance', 'students', 'CalendarCheck'],
    ['Teacher Attendance', 'teachers', 'UserRoundCheck'],
    ['Staff Attendance', 'staff', 'UserCheck'],
    ['Attendance Reports', 'reports', 'BarChart3'],
    ['Monthly Attendance', 'monthly', 'CalendarDays'],
    ['Late Arrival Records', 'late', 'AlarmClock'],
    ['Leave Applications', 'leaves', 'CalendarOff', 'leaves'],
  ]),

  section('fees', 'Fees', 'fees', 'fees', 3, [
    ['Fee Structure', 'structure', 'Table2'],
    ['Fee Categories', 'categories', 'Tags'],
    ['Class-wise Fee Setup', 'class-setup', 'SlidersHorizontal'],
    ['Student Fee Assignment', 'assignments', 'UserCog'],
    ['Fee Collection', 'collection', 'Receipt', 'fee_collection'],
    ['Quick Fee Collection', 'quick-collect', 'Zap', 'fee_collection'],
    ['Monthly Fee Generation', 'generate', 'RefreshCw'],
    ['Fee Vouchers', 'vouchers', 'Ticket'],
    ['Fee Discounts', 'discounts', 'BadgePercent', 'discounts'],
    ['Scholarships', 'scholarships', 'Award', 'discounts'],
    ['Fee Fine and Penalties', 'fines', 'OctagonAlert'],
    ['Fee Defaulter List', 'defaulters', 'CircleAlert'],
    ['Fee Refunds', 'refunds', 'Undo2', 'refunds'],
    ['Fee Adjustments', 'adjustments', 'Scale'],
    ['Payment History', 'payments', 'History', 'fee_collection'],
    ['WhatsApp Fee Reminders', 'reminders', 'MessageCircle', 'communication'],
  ]),

  section('finance', 'Finance', 'finance', 'finance', 3, [
    ['Expenses', 'expenses', 'CreditCard', 'expenses'],
    ['Expense Categories', 'expense-categories', 'Tags', 'expenses'],
    ['Income', 'income', 'TrendingUp', 'income'],
    ['Other Income', 'other-income', 'PiggyBank', 'income'],
    ['Cash Book', 'cash-book', 'Banknote'],
    ['Bank Transactions', 'bank', 'Landmark'],
    ['Income vs Expense', 'income-vs-expense', 'PieChart'],
    ['Financial Reports', 'reports', 'BarChart3', 'reports'],
  ]),

  section('staff', 'Staff and Payroll', 'staff', 'staff', 5, [
    ['Staff Management', 'members', 'Briefcase'],
    ['Teacher Management', 'teachers', 'Presentation'],
    ['Employee Designations', 'designations', 'BadgeCheck'],
    ['Departments', 'departments', 'Building2'],
    ['Staff Attendance', 'attendance', 'UserCheck', 'attendance'],
    ['Leave Management', 'leaves', 'CalendarOff', 'leaves'],
    ['Salary Structure', 'salary-structure', 'Table2', 'payroll'],
    ['Salary Management', 'salaries', 'Wallet', 'payroll'],
    ['Monthly Payroll', 'payroll', 'CalendarRange', 'payroll'],
    ['Salary Payments', 'payments', 'Banknote', 'payroll'],
    ['Salary Slips', 'slips', 'FileText', 'payroll'],
    ['Advance Salary', 'advances', 'HandCoins', 'payroll'],
    ['Loan and Deductions', 'loans', 'Scale', 'payroll'],
    ['Payroll Reports', 'payroll-reports', 'BarChart3', 'payroll'],
  ]),

  section('communication', 'Communication', 'communication', 'communication', 6, [
    ['Notices', 'notices', 'Bell'],
    ['Circulars', 'circulars', 'FileText'],
    ['Announcements', 'announcements', 'Megaphone'],
    ['SMS Notifications', 'sms', 'MessageSquare'],
    ['WhatsApp Notifications', 'whatsapp', 'MessageCircle'],
    ['Email Notifications', 'email', 'Mail'],
    ['Parent Communication', 'parents', 'Users'],
    ['Notification History', 'history', 'History'],
  ]),

  section('library', 'Library', 'library', 'library', 6, [
    ['Books', 'books', 'BookOpen'],
    ['Book Categories', 'categories', 'Tags'],
    ['Book Inventory', 'inventory', 'Library'],
    ['Book Issue', 'issue', 'BookmarkPlus'],
    ['Book Return', 'return', 'Undo2'],
    ['Overdue Books', 'overdue', 'AlarmClock'],
    ['Library Fines', 'fines', 'Banknote'],
    ['Library Reports', 'reports', 'BarChart3'],
  ]),

  section('transport', 'Transport', 'transport', 'transport', 6, [
    ['Vehicles', 'vehicles', 'Bus'],
    ['Drivers', 'drivers', 'UserRound'],
    ['Routes', 'routes', 'Route'],
    ['Transport Stops', 'stops', 'MapPin'],
    ['Student Transport Assignment', 'assignments', 'Users'],
    ['Transport Fees', 'fees', 'Banknote'],
    ['Transport Attendance', 'attendance', 'CalendarCheck'],
    ['Transport Reports', 'reports', 'BarChart3'],
  ]),

  section('inventory', 'Inventory', 'inventory', 'inventory', 6, [
    ['Inventory Items', 'items', 'Package'],
    ['Categories', 'categories', 'Tags'],
    ['Suppliers', 'suppliers', 'Truck'],
    ['Stock Purchases', 'purchases', 'ShoppingCart'],
    ['Stock Issuance', 'issuance', 'PackageOpen'],
    ['Stock Adjustments', 'adjustments', 'SlidersHorizontal'],
    ['Low Stock Alerts', 'low-stock', 'CircleAlert'],
    ['Inventory Reports', 'reports', 'BarChart3'],
  ]),

  {
    id: 'admin', title: 'School Administration',
    items: [
      ...section('admin', '', 'admin', 'settings', 1, [
        ['School Profile', 'school', 'Building2'],
        ['Branch Management', 'branches', 'GitBranch'],
        ['User Management', 'users', 'Users', 'users'],
        ['Roles and Permissions', 'roles', 'ShieldCheck', 'roles'],
        ['System Settings', 'settings', 'Settings'],
        ['Academic Settings', 'academic-settings', 'Settings2'],
        ['Fee Settings', 'fee-settings', 'Settings2'],
        ['Notification Settings', 'notification-settings', 'BellRing'],
        ['Backup and Restore', 'backup', 'DatabaseBackup', 'backup'],
        ['Audit Logs', 'audit', 'FileSearch', 'audit'],
      ]).items,
      { label: 'Password Change', path: '/account/password', icon: 'KeyRound', module: 'dashboard', phase: 1 },
      { label: 'Logout', path: '#logout', icon: 'LogOut', module: 'dashboard', phase: 1, action: 'logout' },
    ],
  },
];

// "Financial Reports" opens the All Reports hub.
NAVIGATION.forEach((sec) => sec.items.forEach((i) => { if (i.path === '/finance/reports') i.path = '/reports'; }));

export const ALL_NAV_ITEMS = NAVIGATION.flatMap((s) => s.items);

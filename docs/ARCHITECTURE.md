# Architecture and Build Plan

## Repository layout
```
school-erp/
  package.json              npm workspaces + root scripts
  docker-compose.yml        PostgreSQL 16
  docs/
  apps/
    api/
      prisma/               schema.prisma, seed.ts, migrations/
      src/
        config/             env (zod-validated), prisma client, permission catalogue + default roles
        middleware/         auth (authenticate, authorize, tenant), validate, errorHandler, rateLimit
        utils/              ApiError, asyncHandler, tokens, audit
        modules/            one folder per domain (auth, health live; rest added per phase)
        tests/
        app.ts  server.ts  routes.ts
      uploads/  backups/
    web/
      src/
        app/                App, router, ProtectedRoute
        components/         layout/ (Sidebar, Topbar, AppLayout), common/, ui/
        config/             navigation.ts (118 items), reports.ts, icons.ts
        features/           per-module UI + hooks (added per phase)
        hooks/  lib/ (api client, cn)  store/ (auth)  pages/  styles/  types/
```

## Auth model
- Access token: JWT, 15 min, held in memory only.
- Refresh token: opaque random string in an httpOnly cookie scoped to `/api/v1/auth`; only its SHA-256 hash is stored; rotated on every refresh; reuse of a revoked token revokes all of that user's sessions.
- Permissions: `module:ACTION` strings loaded per request from role grants. Frontend hides menu items; the backend enforces.
- Login attempts (success and failure) are written to `login_history`.

## Multi-tenancy
Each tenant-owned table carries `schoolId`. `tenant(req)` returns the filter every query must spread in. Emails are globally unique in Phase 1.

## Database: Phase 1 tables (in schema.prisma)
schools, branches, users, roles, permissions, role_permissions, user_roles, refresh_tokens, login_history, academic_sessions, school_settings, audit_logs.

## Database: tables added per phase
| Phase | Tables |
|---|---|
| 2 | classes, sections, subjects, class_subjects, teacher_assignments, students, student_guardians, student_documents, admission_enquiries, admissions, student_enrollments, student_promotions |
| 3 | fee_categories, fee_structures, student_fee_assignments, fee_invoices, fee_invoice_items, fee_payments, payment_allocations, fee_discounts, scholarships, fee_refunds, expense_categories, expenses, income |
| 4 | attendance, leave_applications, examinations, exam_schedules, marks, grading_rules, report_cards, timetables, homework, homework_submissions |
| 5 | employees, employee_attendance, salary_structures, payrolls, payroll_items, salary_payments |
| 6 | notices, notifications, notification_logs, books, library_issues, vehicles, transport_routes, transport_assignments, inventory_items, suppliers, stock_transactions |

## Phases
1. Foundation: auth, RBAC, layout, navigation, settings shell. (setup done; see "Next")
2. Academic foundation and admissions
3. Finance: fees, receipts, expenses
4. Academics: attendance, exams, report cards
5. Staff and payroll
6. Portals, library, transport, inventory, notifications
7. Reports and exports
8. Security review, tests, backups, deployment

## Design tokens (web)
Sidebar: ink-950 -> ink-800 gradient (`#04252B` to `#0B434C`), active item `brand-500 #14A596`. Content canvas `#F3F7F8`, cards white with `line #E3ECEE` borders. Outlined action buttons use emerald. Font: Plus Jakarta Sans.

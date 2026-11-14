import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Hourglass,
  Loader2,
  Receipt,
  RefreshCw,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  CreditCard,
  PiggyBank,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtMoney } from "@/features/fees/shared";
import { monthLabel, signedMoney } from "@/features/finance/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";

interface Dashboard {
  asOf: string;
  month: string;
  session: { id: string; name: string } | null;
  students: null | {
    total: number;
    active: number;
    boys: number;
    girls: number;
    newThisMonth: number;
    byClass: { className: string; count: number }[];
    admissions: { month: string; count: number }[];
  };
  fees: null | {
    pending: string;
    overdue: string;
    defaulters: number;
    invoicedThisMonth: string;
    appliedThisMonth: string;
    collectedThisMonth: string;
    statusThisMonth: { paid: number; partial: number; open: number };
    monthlyCollection: { month: string; amount: string }[];
  };
  finance: null | {
    thisMonth: {
      income: string;
      expenses: string;
      net: string;
      otherIncome: string;
      refunds: string;
      fees: string;
    };
    months: { month: string; income: string; expenses: string }[];
  };
  attention: { key: string; label: string; count: number; to: string }[];
}

const TEAL = "#0F8F83";
const ROSE = "#F43F5E";
const compact = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000
      ? `${Math.round(v / 1000)}k`
      : String(v);

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  to,
  tone = "text-ink-950",
  tile = "bg-brand-50 text-brand-600",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: string;
  tile?: string;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
          tile,
        )}
      >
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p
          className={cn(
            "mt-0.5 truncate text-2xl font-extrabold leading-tight",
            tone,
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
  return to ? (
    <Link
      to={to}
      className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

function Chart({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: string | false;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-base font-bold text-ink-950">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-3 h-64">
        {empty ? (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { user, sessionId } = useAuth();
  const q = useQuery({
    queryKey: ["dashboard", sessionId],
    queryFn: async () =>
      (
        await api.get<{ data: Dashboard }>("/dashboard", {
          params: { sessionId: sessionId || undefined },
        })
      ).data.data,
  });
  const d = q.data;

  const status = d?.fees?.statusThisMonth;
  const statusTotal = status ? status.paid + status.partial + status.open : 0;
  const pie = status
    ? [
        { name: "Paid", value: status.paid, color: "#10B981" },
        { name: "Partly paid", value: status.partial, color: "#F59E0B" },
        { name: "Unpaid", value: status.open, color: "#0EA5E9" },
      ].filter((p) => p.value > 0)
    : [];

  const hasSection = !!(d?.students || d?.fees || d?.finance);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user?.fullName}.${d?.session ? ` Session ${d.session.name}.` : ""}`}
        actions={
          <button
            className="btn border border-slate-300"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            {q.isFetching ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Refresh
          </button>
        }
      />

      {q.isLoading && (
        <Loader2 className="mx-auto mt-16 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load the dashboard")}
        </div>
      )}

      {d && (
        <>
          {d.attention.length > 0 && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <TriangleAlert size={16} />
                Needs your attention
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {d.attention.map((a) => (
                  <li key={a.key}>
                    <Link
                      to={a.to}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                    >
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
                        {a.count}
                      </span>
                      {a.label}
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasSection && (
            <div className="card p-8 text-sm text-slate-600">
              Your role does not include any dashboard figures. Use the menu on
              the left to open the areas you work in.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {d.students && (
              <>
                <Stat
                  icon={Users}
                  label="Total students"
                  value={String(d.students.total)}
                  hint="All students on record"
                  to="/students/all"
                />
                <Stat
                  icon={UserCheck}
                  label="Active students"
                  value={String(d.students.active)}
                  hint={`${d.students.boys} boys · ${d.students.girls} girls`}
                  to="/students/all"
                  tile="bg-emerald-50 text-emerald-600"
                />
                <Stat
                  icon={UserPlus}
                  label="New admissions this month"
                  value={String(d.students.newThisMonth)}
                  to="/students/enquiries"
                  tile="bg-sky-50 text-sky-600"
                />
              </>
            )}
            {d.fees && (
              <>
                <Stat
                  icon={Wallet}
                  label="Fee collection this month"
                  value={fmtMoney(d.fees.collectedThisMonth)}
                  hint="Payments received, less reversals"
                  to="/fees/payments"
                  tile="bg-emerald-50 text-emerald-600"
                />
                <Stat
                  icon={Hourglass}
                  label="Pending fees"
                  value={fmtMoney(d.fees.pending)}
                  hint="Unpaid balance on open invoices"
                  to="/fees/vouchers"
                  tile="bg-amber-50 text-amber-600"
                />
                <Stat
                  icon={TriangleAlert}
                  label="Overdue fees"
                  value={fmtMoney(d.fees.overdue)}
                  hint={`${d.fees.defaulters} student${d.fees.defaulters === 1 ? "" : "s"} past the due date`}
                  to="/fees/defaulters"
                  tone="text-rose-600"
                  tile="bg-rose-50 text-rose-600"
                />
              </>
            )}
            {d.finance && (
              <>
                <Stat
                  icon={CreditCard}
                  label="Expenses this month"
                  value={fmtMoney(d.finance.thisMonth.expenses)}
                  hint="Approved expenses"
                  to="/finance/expenses"
                  tile="bg-rose-50 text-rose-600"
                />
                <Stat
                  icon={PiggyBank}
                  label="Net income this month"
                  value={signedMoney(d.finance.thisMonth.net)}
                  hint="Income − expenses"
                  to="/finance/income-vs-expense"
                  tone={
                    Number(d.finance.thisMonth.net) < 0
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }
                  tile="bg-teal-50 text-teal-600"
                />
              </>
            )}
            {d.fees && (
              <Stat
                icon={Receipt}
                label="Invoiced this month"
                value={fmtMoney(d.fees.invoicedThisMonth)}
                hint={`${fmtMoney(d.fees.appliedThisMonth)} paid so far`}
                to="/fees/vouchers"
              />
            )}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {d.fees && (
              <Chart
                title="Monthly fee collection"
                subtitle="Last 6 months"
                empty={
                  d.fees.monthlyCollection.every(
                    (m) => Number(m.amount) === 0,
                  ) && "No fee payments in the last 6 months."
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d.fees.monthlyCollection.map((m) => ({
                      month: monthLabel(m.month),
                      Collected: Number(m.amount),
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={compact}
                    />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Bar
                      dataKey="Collected"
                      fill={TEAL}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Chart>
            )}

            {d.finance && (
              <Chart
                title="Income vs expenses"
                subtitle="Last 6 months"
                empty={
                  d.finance.months.every(
                    (m) => Number(m.income) === 0 && Number(m.expenses) === 0,
                  ) && "No income or expenses recorded in the last 6 months."
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d.finance.months.map((m) => ({
                      month: monthLabel(m.month),
                      Income: Number(m.income),
                      Expenses: Number(m.expenses),
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={compact}
                    />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Legend />
                    <Bar dataKey="Income" fill={TEAL} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill={ROSE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Chart>
            )}

            {d.students && (
              <Chart
                title="Students by class"
                subtitle={
                  d.session
                    ? `Active students enrolled in ${d.session.name}`
                    : undefined
                }
                empty={
                  d.students.byClass.length === 0 &&
                  (d.session
                    ? "No students are enrolled in this session yet."
                    : "Create and select an academic session to see class sizes.")
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d.students.byClass.map((c) => ({
                      name: c.className,
                      Students: c.count,
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="Students"
                      fill="#0EA5E9"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Chart>
            )}

            {d.fees && (
              <Chart
                title="Fee payment status"
                subtitle={`Invoices for ${monthLabel(d.month)}`}
                empty={
                  statusTotal === 0 &&
                  "No invoices have been generated for this month yet."
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      label={(e) => `${e.name}: ${e.value}`}
                    >
                      {pie.map((p) => (
                        <Cell key={p.name} fill={p.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Chart>
            )}

            {d.students && (
              <Chart
                title="Admissions"
                subtitle="New students per month, last 6 months"
                empty={
                  d.students.admissions.every((a) => a.count === 0) &&
                  "No admissions in the last 6 months."
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d.students.admissions.map((a) => ({
                      month: monthLabel(a.month),
                      Admissions: a.count,
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="Admissions"
                      fill="#8B5CF6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Chart>
            )}
          </div>

          <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Teachers, staff, today's attendance and upcoming examinations will
            appear here when those modules are added. Figures are updated each
            time you open or refresh this page (
            {new Date(d.asOf).toLocaleTimeString()}).
          </p>
        </>
      )}
    </>
  );
}

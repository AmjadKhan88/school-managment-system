import { PageHeader } from '@/components/common/PageHeader';
import { useAuth } from '@/store/auth';

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user?.fullName}.`} />
      <div className="card p-8 text-sm text-slate-600">
        <p className="font-semibold text-ink-950">Your workspace is connected.</p>
        <p className="mt-1 max-w-xl">Dashboard figures (students, attendance, fee collection, expenses) are calculated from database records, so they appear once the Student and Fees modules ship in Phases 2 and 3. No placeholder numbers are shown.</p>
      </div>
    </>
  );
}

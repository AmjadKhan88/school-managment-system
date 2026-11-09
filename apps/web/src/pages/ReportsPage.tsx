import { Download, FileSpreadsheet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { QUICK_EXPORTS, REPORT_CARDS } from '@/config/reports';
import { cn } from '@/lib/cn';

export default function ReportsPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="All Reports" subtitle="Explore all available reports." />

      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white"><FileSpreadsheet size={19} /></span>
          <h2 className="text-lg font-bold text-ink-950">Export to Excel</h2>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">Download any report in Excel (.xlsx) file with default filters (current month / year). Open a report to export with your own filters.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {QUICK_EXPORTS.map(([label, slug]) => (
            <button key={slug} onClick={() => navigate(`/reports/${slug}`)} className="btn-outline">
              <Download size={16} />{label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600">Attendance Report : Choose a class inside the report, then press <strong>Export Excel.</strong></p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {REPORT_CARDS.map(({ slug, title, description, icon: Icon, tile, highlight }) => (
          <Link key={slug} to={`/reports/${slug}`}
            className={cn('card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5',
              highlight && 'border-amber-200 bg-amber-50/70')}>
            <span className={cn('grid h-[68px] w-[68px] shrink-0 place-items-center rounded-2xl', tile)}><Icon size={32} strokeWidth={1.8} /></span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[17px] font-bold leading-snug text-ink-950">
                {title}
                {highlight && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950">New</span>}
              </span>
              <span className="mt-1 block text-sm leading-snug text-slate-600">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

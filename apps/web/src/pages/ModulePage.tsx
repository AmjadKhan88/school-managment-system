import { Hammer } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { ALL_NAV_ITEMS } from '@/config/navigation';

/** Route stub for modules not built yet. Replaced one by one in later phases. */
export default function ModulePage() {
  const { pathname } = useLocation();
  const item = ALL_NAV_ITEMS.find((i) => i.path === pathname);
  return (
    <>
      <PageHeader title={item?.label ?? 'Module'} />
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600"><Hammer size={22} /></span>
        <p className="mt-4 font-semibold text-ink-950">Scheduled for Phase {item?.phase ?? '—'}</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">The route, permission check and navigation entry are ready. The screen and API arrive with its phase.</p>
      </div>
    </>
  );
}

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth';

export function ProtectedRoute() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc.pathname }} />;
}

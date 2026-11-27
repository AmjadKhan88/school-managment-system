import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isPortalUser } from "@/features/portal/shared";
import { useAuth } from "@/store/auth";

export function ProtectedRoute() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading…
      </div>
    );
  if (!user)
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  // Students and parents change their password inside the portal, staff inside the main app.
  const passwordPath = isPortalUser(user)
    ? "/portal/password"
    : "/account/password";
  if (user.mustChangePassword && loc.pathname !== passwordPath)
    return <Navigate to={passwordPath} replace />;
  return <Outlet />;
}

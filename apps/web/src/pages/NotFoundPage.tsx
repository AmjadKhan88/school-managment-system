import { Link } from 'react-router-dom';
export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div><p className="text-5xl font-extrabold text-brand-600">404</p><p className="mt-2 text-slate-600">This page does not exist.</p>
        <Link to="/dashboard" className="btn-primary mt-5">Back to dashboard</Link></div>
    </div>
  );
}

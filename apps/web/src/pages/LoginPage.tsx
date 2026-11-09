import { zodResolver } from '@hookform/resolvers/zod';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/store/auth';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const { user, setAuth } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard';
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (values: Form) => {
    try {
      const { data } = await api.post('/auth/login', values);
      setAuth(data.data.accessToken, data.data.user);
      navigate(from, { replace: true });
    } catch (e) { toast.error(apiMessage(e, 'Could not sign in')); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-ink-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-600"><GraduationCap /></span><span className="text-lg font-bold">School ERP</span></div>
        <div>
          <h1 className="max-w-md text-4xl font-extrabold leading-tight">Admissions to report cards, in one place.</h1>
          <p className="mt-4 max-w-md text-ink-200">Fees, attendance, exams, payroll and parent communication run from a single school record.</p>
        </div>
        <p className="text-sm text-ink-300">Secure sign-in. Access depends on your assigned role.</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
      </section>

      <section className="grid place-items-center bg-white p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm" noValidate>
          <h2 className="text-2xl font-extrabold text-ink-950">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use the email your school administrator gave you.</p>
          <label className="mt-6 block text-sm font-semibold">Email
            <input type="email" autoComplete="username" className="input mt-1.5 font-normal" {...register('email')} />
            {errors.email && <span className="mt-1 block text-xs font-normal text-rose-600">{errors.email.message}</span>}
          </label>
          <label className="mt-4 block text-sm font-semibold">Password
            <input type="password" autoComplete="current-password" className="input mt-1.5 font-normal" {...register('password')} />
            {errors.password && <span className="mt-1 block text-xs font-normal text-rose-600">{errors.password.message}</span>}
          </label>
          <button disabled={isSubmitting} className="btn-primary mt-6 w-full py-2.5">
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}Sign in
          </button>
        </form>
      </section>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Field, fmtDate } from "./shared";

interface Account {
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}
interface Data {
  student: { id: string; name: string; canHaveLogin: boolean; account: Account | null };
  guardians: { id: string; name: string; relation: string; isPrimary: boolean; phone: string; email: string | null; account: Account | null }[];
}
type Kind = "student" | "guardian";
interface Creds { email: string; tempPassword: string }
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Student and parent logins for one student, managed from the student profile. */
export function PortalLogins({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [creating, setCreating] = useState<{ kind: Kind; id: string; name: string; email: string } | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);

  const q = useQuery({
    queryKey: ["portal-accounts", studentId],
    queryFn: async () => (await api.get<{ data: Data }>(`/portal-accounts/student/${studentId}`)).data.data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["portal-accounts", studentId] });

  const reset = useMutation({
    mutationFn: (v: { kind: Kind; id: string }) => api.post<{ data: Creds }>(`/portal-accounts/${v.kind}/${v.id}/reset`),
    onSuccess: (r) => { setCreds(r.data.data); refresh(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const active = useMutation({
    mutationFn: (v: { kind: Kind; id: string; isActive: boolean }) => api.post(`/portal-accounts/${v.kind}/${v.id}/active`, { isActive: v.isActive }),
    onSuccess: (_r, v) => { toast.success(v.isActive ? "Login enabled" : "Login disabled"); refresh(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (q.isLoading) return <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />;
  if (q.isError) return <div className="card p-6 text-center text-sm text-rose-600">{apiMessage(q.error, "Could not load logins")}</div>;
  const d = q.data!;

  const row = (kind: Kind, id: string, title: string, sub: string, account: Account | null, canHave: boolean, suggested: string) => (
    <div key={`${kind}${id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-bold text-ink-950">{title}</p>
        <p className="text-xs text-slate-500">{sub}</p>
        {account ? (
          <p className="mt-1 text-sm">
            {account.email}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${account.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{account.isActive ? "Active" : "Disabled"}</span>
            {account.mustChangePassword && <span className="ml-2 text-xs text-amber-700">has not set own password yet</span>}
          </p>
        ) : <p className="mt-1 text-sm text-slate-500">No login yet.</p>}
        {account?.lastLoginAt && <p className="text-xs text-slate-500">Last sign-in {fmtDate(account.lastLoginAt)}</p>}
      </div>
      <div className="flex gap-2">
        {!account && can("users", "CREATE") && (
          <button className="btn-primary py-1.5" disabled={!canHave} title={canHave ? "" : "Only active students can have a login"} onClick={() => setCreating({ kind, id, name: title, email: suggested })}>Create login</button>
        )}
        {account && can("users", "EDIT") && (
          <>
            <button className="btn border border-slate-300 py-1.5" disabled={reset.isPending} onClick={() => window.confirm(`Reset the password for ${account.email}? They will be signed out.`) && reset.mutate({ kind, id })}><KeyRound size={15} />Reset password</button>
            <button className="btn border border-slate-300 py-1.5" disabled={active.isPending} onClick={() => active.mutate({ kind, id, isActive: !account.isActive })}>{account.isActive ? "Disable" : "Enable"}</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">A parent login sees every child linked to that guardian, so brothers and sisters share one login. Each person gets a temporary password that must be changed at first sign-in.</p>
      {row("student", d.student.id, d.student.name, "Student login", d.student.account, d.student.canHaveLogin, "")}
      {d.guardians.map((g) => row("guardian", g.id, g.name, `${cap(g.relation)}${g.isPrimary ? " · primary" : ""} · ${g.phone}`, g.account, true, g.email ?? ""))}

      {creating && <CreateDialog target={creating} onClose={() => setCreating(null)} onDone={(c) => { setCreating(null); setCreds(c); refresh(); }} />}
      {creds && <CredsDialog creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}

function CreateDialog({ target, onClose, onDone }: { target: { kind: Kind; id: string; name: string; email: string }; onClose: () => void; onDone: (c: Creds) => void }) {
  const [email, setEmail] = useState(target.email);
  const save = useMutation({
    mutationFn: () => api.post<{ data: Creds }>(`/portal-accounts/${target.kind}/${target.id}`, { email }),
    onSuccess: (r) => onDone(r.data.data),
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Create login</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-slate-100"><X size={18} /></button></div>
        <p className="mt-1 text-sm text-slate-600">{target.name}</p>
        <Field label="Email (used to sign in) *" className="mt-4"><input required autoFocus type="email" className="input mt-1.5 font-normal" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn border border-slate-300" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending}>{save.isPending && <Loader2 size={15} className="animate-spin" />}Create</button></div>
      </form>
    </div>
  );
}

function CredsDialog({ creds, onClose }: { creds: Creds; onClose: () => void }) {
  const text = `Email: ${creds.email}\nTemporary password: ${creds.tempPassword}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-sm p-6">
        <h2 className="text-lg font-bold">Login ready</h2>
        <p className="mt-1 text-sm text-slate-600">Give these details to the person now. The password is shown only once and must be changed at first sign-in.</p>
        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-sm">{text}</pre>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn border border-slate-300" onClick={() => { navigator.clipboard?.writeText(text); toast.success("Copied"); }}><Copy size={15} />Copy</button>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

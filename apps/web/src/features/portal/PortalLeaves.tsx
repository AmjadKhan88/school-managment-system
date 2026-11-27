import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Field, fmtDate, todayIso } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChildGate, Empty, Spinner } from "./ChildGate";
import { LEAVE_STATUS } from "./shared";

interface Leave {
  id: string;
  applicationNo: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  rejectionReason: string | null;
  cancelReason: string | null;
  canCancel: boolean;
}
const TYPES: [string, string][] = [
  ["SICK", "Sick leave"],
  ["CASUAL", "Casual leave"],
  ["EMERGENCY", "Emergency"],
  ["FAMILY", "Family event"],
  ["OTHER", "Other"],
];
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function PortalLeaves() {
  const [open, setOpen] = useState(false);
  return (
    <ChildGate
      title="Leave"
      subtitle="apply and track"
      actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Apply for leave</button>}
    >
      {(c) => (
        <>
          <List studentId={c.id} />
          {open && <Apply studentId={c.id} onClose={() => setOpen(false)} />}
        </>
      )}
    </ChildGate>
  );
}

function List({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["portal", "leaves", studentId],
    queryFn: async () =>
      (await api.get<{ data: Leave[] }>("/portal/leaves", { params: { studentId } })).data.data,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/portal/leaves/${id}/cancel`, { studentId }),
    onSuccess: () => { toast.success("Application cancelled"); qc.invalidateQueries({ queryKey: ["portal"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <div className="card p-6 text-center text-sm text-rose-600">{apiMessage(q.error, "Could not load")}</div>;
  if (!q.data?.length) return <Empty>No leave applications yet.</Empty>;
  return (
    <div className="grid gap-3">
      {q.data.map((l) => (
        <div key={l.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <p className="font-bold text-ink-950">
              {fmtDate(l.startDate)}{l.days > 1 ? ` to ${fmtDate(l.endDate)}` : ""} · {l.days} day{l.days === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-500">{l.applicationNo} · {label(l.leaveType)}</p>
            <p className="mt-1 text-sm">{l.reason}</p>
            {l.rejectionReason && <p className="mt-1 text-sm text-rose-700">Reason for rejection: {l.rejectionReason}</p>}
          </div>
          <div className="text-right">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", LEAVE_STATUS[l.status])}>{label(l.status)}</span>
            {l.canCancel && (
              <button
                className="mt-2 block text-xs font-semibold text-rose-600 hover:underline"
                disabled={cancel.isPending}
                onClick={() => window.confirm("Cancel this application?") && cancel.mutate(l.id)}
              >
                Cancel application
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Apply({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ leaveType: "SICK", startDate: todayIso(), endDate: todayIso(), reason: "" });
  const save = useMutation({
    mutationFn: () => api.post("/portal/leaves", { studentId, ...f }),
    onSuccess: () => { toast.success("Application sent to the school"); qc.invalidateQueries({ queryKey: ["portal"] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center" role="dialog" aria-modal="true">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Apply for leave</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Type *">
            <select className="input mt-1.5 font-normal" value={f.leaveType} onChange={(e) => setF({ ...f, leaveType: e.target.value })}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From *"><input required type="date" className="input mt-1.5 font-normal" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} /></Field>
            <Field label="To *"><input required type="date" min={f.startDate} className="input mt-1.5 font-normal" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          </div>
          <Field label="Reason *"><textarea required minLength={5} rows={3} className="input mt-1.5 font-normal" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn border border-slate-300" onClick={onClose}>Close</button>
          <button className="btn-primary" disabled={save.isPending}>{save.isPending && <Loader2 size={15} className="animate-spin" />}Send</button>
        </div>
      </form>
    </div>
  );
}

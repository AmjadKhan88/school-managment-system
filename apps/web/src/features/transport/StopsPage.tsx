import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { fmtMoney, Modal, Pill, Stop, useRoutes } from "./shared";

export default function StopsPage() {
  const can = useAuth((s) => s.can);
  const [sp, setSp] = useSearchParams();
  const routeId = sp.get("routeId") ?? "";
  const routes = useRoutes();
  const [dialog, setDialog] = useState<Stop | "new" | null>(null);
  const q = useQuery({
    queryKey: ["transport", "stops", routeId],
    enabled: !!routeId,
    queryFn: async () =>
      (
        await api.get<{ data: Stop[] }>("/transport/stops", {
          params: { routeId },
        })
      ).data.data,
  });

  return (
    <>
      <PageHeader
        title="Transport Stops"
        subtitle="The stops of a route, in order, with pickup times."
        actions={
          <div className="flex gap-2">
            <select
              className="input w-56"
              value={routeId}
              onChange={(e) =>
                setSp(e.target.value ? { routeId: e.target.value } : {})
              }
              aria-label="Route"
            >
              <option value="">Choose a route…</option>
              {routes.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {can("transport", "CREATE") && routeId && (
              <button className="btn-primary" onClick={() => setDialog("new")}>
                <Plus size={16} />
                Add stop
              </button>
            )}
          </div>
        }
      />
      {!routeId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a route to see its stops.
        </div>
      )}
      {routeId && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                {[
                  "Order",
                  "Stop",
                  "Pickup",
                  "Monthly fee",
                  "Students",
                  "Status",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2
                      className="mx-auto animate-spin text-slate-400"
                      size={18}
                    />
                  </td>
                </tr>
              )}
              {q.data?.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No stops on this route yet.
                  </td>
                </tr>
              )}
              {q.data?.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    "border-b border-line last:border-0",
                    !s.isActive && "text-slate-400",
                  )}
                >
                  <td className="px-4 py-3">{s.sortOrder}</td>
                  <td className="px-4 py-3 font-semibold">{s.name}</td>
                  <td className="px-4 py-3">{s.pickupTime ?? "—"}</td>
                  <td className="px-4 py-3">{fmtMoney(s.monthlyFee)}</td>
                  <td className="px-4 py-3">{s.students}</td>
                  <td className="px-4 py-3">
                    <Pill on={s.isActive} yes="In use" no="Not in use" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {can("transport", "EDIT") && (
                      <button
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        onClick={() => setDialog(s)}
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <StopDialog
          routeId={routeId}
          stop={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function StopDialog({
  routeId,
  stop,
  onClose,
}: {
  routeId: string;
  stop: Stop | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: stop?.name ?? "",
    sortOrder: stop ? String(stop.sortOrder) : "",
    pickupTime: stop?.pickupTime ?? "",
    monthlyFee: stop ? stop.monthlyFee : "",
    isActive: stop?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      stop
        ? api.put(`/transport/stops/${stop.id}`, { routeId, ...f })
        : api.post("/transport/stops", { routeId, ...f }),
    onSuccess: () => {
      toast.success("Stop saved");
      qc.invalidateQueries({ queryKey: ["transport"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal
      title={stop ? "Edit stop" : "Add stop"}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      busy={save.isPending}
    >
      <Field label="Stop name *">
        <input
          required
          className="input mt-1.5 font-normal"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Order on the route">
          <input
            type="number"
            min="1"
            className="input mt-1.5 font-normal"
            placeholder="next"
            value={f.sortOrder}
            onChange={(e) => setF({ ...f, sortOrder: e.target.value })}
          />
        </Field>
        <Field label="Pickup time">
          <input
            type="time"
            className="input mt-1.5 font-normal"
            value={f.pickupTime}
            onChange={(e) => setF({ ...f, pickupTime: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Monthly fee *">
        <input
          required
          type="number"
          min="0"
          step="0.01"
          className="input mt-1.5 font-normal"
          value={f.monthlyFee}
          onChange={(e) => setF({ ...f, monthlyFee: e.target.value })}
        />
      </Field>
      {stop && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={f.isActive}
            onChange={(e) => setF({ ...f, isActive: e.target.checked })}
          />
          Stop in use
        </label>
      )}
    </Modal>
  );
}

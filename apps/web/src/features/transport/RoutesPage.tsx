import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  Modal,
  Pill,
  RouteRow,
  useDrivers,
  useRoutes,
  useVehicles,
} from "./shared";

export default function RoutesPage() {
  const can = useAuth((s) => s.can);
  const q = useRoutes();
  const [dialog, setDialog] = useState<RouteRow | "new" | null>(null);
  return (
    <>
      <PageHeader
        title="Routes"
        subtitle="Each route has a vehicle, a driver and its stops."
        actions={
          can("transport", "CREATE") && (
            <button className="btn-primary" onClick={() => setDialog("new")}>
              <Plus size={16} />
              Add route
            </button>
          )
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Route",
                "Vehicle",
                "Driver",
                "Times",
                "Stops",
                "Students",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
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
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No routes yet.
                </td>
              </tr>
            )}
            {q.data?.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "border-b border-line last:border-0",
                  !r.isActive && "text-slate-400",
                )}
              >
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3">
                  {r.vehicle ? `${r.vehicle.vehicleNo}` : "—"}
                  {r.vehicle && (
                    <span className="block text-xs text-slate-500">
                      {r.students} of {r.vehicle.capacity} seats
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.driver?.fullName ?? "—"}
                  <span className="block text-xs text-slate-500">
                    {r.driver?.phone ?? ""}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.morningTime ? `Morning ${r.morningTime}` : ""}
                  {r.morningTime && r.afternoonTime ? <br /> : ""}
                  {r.afternoonTime ? `Afternoon ${r.afternoonTime}` : ""}
                  {!r.morningTime && !r.afternoonTime && "—"}
                </td>
                <td className="px-4 py-3">{r.stops}</td>
                <td className="px-4 py-3">{r.students}</td>
                <td className="px-4 py-3">
                  <Pill on={r.isActive} />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Link
                      to={`/transport/stops?routeId=${r.id}`}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      <MapPin size={13} className="mr-1 inline" />
                      Stops
                    </Link>
                    {can("transport", "EDIT") && (
                      <button
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        onClick={() => setDialog(r)}
                        aria-label={`Edit ${r.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && (
        <RouteDialog
          route={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function RouteDialog({
  route,
  onClose,
}: {
  route: RouteRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const vehicles = useVehicles();
  const drivers = useDrivers();
  const [f, setF] = useState({
    name: route?.name ?? "",
    vehicleId: route?.vehicle?.id ?? "",
    driverId: route?.driver?.id ?? "",
    morningTime: route?.morningTime ?? "",
    afternoonTime: route?.afternoonTime ?? "",
    notes: route?.notes ?? "",
    isActive: route?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      route
        ? api.put(`/transport/routes/${route.id}`, f)
        : api.post("/transport/routes", f),
    onSuccess: () => {
      toast.success("Route saved");
      qc.invalidateQueries({ queryKey: ["transport"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal
      title={route ? "Edit route" : "Add route"}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      busy={save.isPending}
    >
      <Field label="Route name *">
        <input
          required
          className="input mt-1.5 font-normal"
          placeholder="Hayatabad route"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      <Field label="Vehicle">
        <select
          className="input mt-1.5 font-normal"
          value={f.vehicleId}
          onChange={(e) => setF({ ...f, vehicleId: e.target.value })}
        >
          <option value="">None yet</option>
          {vehicles.data
            ?.filter((v) => v.status !== "RETIRED" || v.id === f.vehicleId)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.vehicleNo} ({v.capacity} seats)
              </option>
            ))}
        </select>
      </Field>
      <Field label="Driver">
        <select
          className="input mt-1.5 font-normal"
          value={f.driverId}
          onChange={(e) => setF({ ...f, driverId: e.target.value })}
        >
          <option value="">None yet</option>
          {drivers.data
            ?.filter((d) => d.isActive || d.id === f.driverId)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Morning departs">
          <input
            type="time"
            className="input mt-1.5 font-normal"
            value={f.morningTime}
            onChange={(e) => setF({ ...f, morningTime: e.target.value })}
          />
        </Field>
        <Field label="Afternoon departs">
          <input
            type="time"
            className="input mt-1.5 font-normal"
            value={f.afternoonTime}
            onChange={(e) => setF({ ...f, afternoonTime: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Notes">
        <input
          className="input mt-1.5 font-normal"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </Field>
      {route && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={f.isActive}
            onChange={(e) => setF({ ...f, isActive: e.target.checked })}
          />
          Route in use
        </label>
      )}
    </Modal>
  );
}

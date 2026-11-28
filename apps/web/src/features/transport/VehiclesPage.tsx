import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Wrench } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { Field, fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  dateVal,
  Expiry,
  fmtMoney,
  Modal,
  useVehicles,
  Vehicle,
} from "./shared";

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["In service", "bg-emerald-100 text-emerald-700"],
  MAINTENANCE: ["In workshop", "bg-amber-100 text-amber-700"],
  RETIRED: ["Retired", "bg-slate-200 text-slate-600"],
};

export default function VehiclesPage() {
  const can = useAuth((s) => s.can);
  const q = useVehicles();
  const [dialog, setDialog] = useState<Vehicle | "new" | null>(null);
  const [service, setService] = useState<Vehicle | null>(null);
  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle="Buses and vans, their seats and their paperwork."
        actions={
          can("transport", "CREATE") && (
            <button className="btn-primary" onClick={() => setDialog("new")}>
              <Plus size={16} />
              Add vehicle
            </button>
          )
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Vehicle",
                "Status",
                "Seats",
                "Routes",
                "Registration",
                "Insurance",
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
                  No vehicles yet.
                </td>
              </tr>
            )}
            {q.data?.map((v) => (
              <tr
                key={v.id}
                className={cn(
                  "border-b border-line last:border-0",
                  v.status === "RETIRED" && "text-slate-400",
                )}
              >
                <td className="px-4 py-3">
                  <span className="font-semibold">{v.vehicleNo}</span>
                  <span className="block text-xs text-slate-500">
                    {[v.make, v.model, v.year].filter(Boolean).join(" ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      STATUS[v.status][1],
                    )}
                  >
                    {STATUS[v.status][0]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <strong
                    className={v.assigned >= v.capacity ? "text-rose-600" : ""}
                  >
                    {v.assigned}
                  </strong>{" "}
                  of {v.capacity}
                </td>
                <td className="px-4 py-3 text-xs">
                  {v.routes.join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <Expiry
                    date={v.registrationExpiry}
                    state={v.registrationState}
                  />
                </td>
                <td className="px-4 py-3">
                  <Expiry date={v.insuranceExpiry} state={v.insuranceState} />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() => setService(v)}
                    >
                      <Wrench size={13} className="mr-1 inline" />
                      Maintenance
                    </button>
                    {can("transport", "EDIT") && (
                      <button
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        onClick={() => setDialog(v)}
                        aria-label={`Edit ${v.vehicleNo}`}
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
        <VehicleDialog
          vehicle={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
      )}
      {service && (
        <MaintenanceDialog vehicle={service} onClose={() => setService(null)} />
      )}
    </>
  );
}

function VehicleDialog({
  vehicle,
  onClose,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    vehicleNo: vehicle?.vehicleNo ?? "",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    year: vehicle?.year ? String(vehicle.year) : "",
    capacity: vehicle ? String(vehicle.capacity) : "",
    status: vehicle?.status ?? "ACTIVE",
    registrationExpiry: dateVal(vehicle?.registrationExpiry),
    insuranceExpiry: dateVal(vehicle?.insuranceExpiry),
    notes: vehicle?.notes ?? "",
  });
  const set =
    (k: keyof typeof f) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      vehicle
        ? api.put(`/transport/vehicles/${vehicle.id}`, f)
        : api.post("/transport/vehicles", f),
    onSuccess: () => {
      toast.success("Vehicle saved");
      qc.invalidateQueries({ queryKey: ["transport"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal
      title={vehicle ? "Edit vehicle" : "Add vehicle"}
      wide
      onClose={onClose}
      onSubmit={() => save.mutate()}
      busy={save.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Number plate *">
          <input
            required
            className="input mt-1.5 font-normal uppercase"
            value={f.vehicleNo}
            onChange={set("vehicleNo")}
          />
        </Field>
        <Field label="Seats *">
          <input
            required
            type="number"
            min="1"
            max="100"
            className="input mt-1.5 font-normal"
            value={f.capacity}
            onChange={set("capacity")}
          />
        </Field>
        <Field label="Make">
          <input
            className="input mt-1.5 font-normal"
            placeholder="Toyota"
            value={f.make}
            onChange={set("make")}
          />
        </Field>
        <Field label="Model">
          <input
            className="input mt-1.5 font-normal"
            placeholder="Coaster"
            value={f.model}
            onChange={set("model")}
          />
        </Field>
        <Field label="Year">
          <input
            type="number"
            className="input mt-1.5 font-normal"
            value={f.year}
            onChange={set("year")}
          />
        </Field>
        <Field label="Status">
          <select
            className="input mt-1.5 font-normal"
            value={f.status}
            onChange={set("status")}
          >
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v[0]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Registration valid until">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            value={f.registrationExpiry}
            onChange={set("registrationExpiry")}
          />
        </Field>
        <Field label="Insurance valid until">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            value={f.insuranceExpiry}
            onChange={set("insuranceExpiry")}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            rows={2}
            className="input mt-1.5 font-normal"
            value={f.notes}
            onChange={set("notes")}
          />
        </Field>
      </div>
    </Modal>
  );
}

interface Service {
  id: string;
  serviceDate: string;
  description: string;
  cost: string | null;
  workshop: string | null;
  nextDueDate: string | null;
  odometer: number | null;
}

function MaintenanceDialog({
  vehicle,
  onClose,
}: {
  vehicle: Vehicle;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const list = useQuery({
    queryKey: ["transport", "maintenance", vehicle.id],
    queryFn: async () =>
      (
        await api.get<{ data: Service[] }>(
          `/transport/vehicles/${vehicle.id}/maintenance`,
        )
      ).data.data,
  });
  const [f, setF] = useState({
    serviceDate: localToday(),
    description: "",
    cost: "",
    workshop: "",
    nextDueDate: "",
    odometer: "",
  });
  const add = useMutation({
    mutationFn: () =>
      api.post(`/transport/vehicles/${vehicle.id}/maintenance`, f),
    onSuccess: () => {
      toast.success("Recorded");
      setF({
        ...f,
        description: "",
        cost: "",
        workshop: "",
        nextDueDate: "",
        odometer: "",
      });
      qc.invalidateQueries({
        queryKey: ["transport", "maintenance", vehicle.id],
      });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal
      title={`Maintenance: ${vehicle.vehicleNo}`}
      wide
      onClose={onClose}
      onSubmit={() => can("transport", "CREATE") && add.mutate()}
      busy={add.isPending}
      submitLabel="Add record"
    >
      {can("transport", "CREATE") ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date *">
            <input
              required
              type="date"
              max={localToday()}
              className="input mt-1.5 font-normal"
              value={f.serviceDate}
              onChange={(e) => setF({ ...f, serviceDate: e.target.value })}
            />
          </Field>
          <Field label="Work done *" className="sm:col-span-2">
            <input
              required
              className="input mt-1.5 font-normal"
              placeholder="Oil change and brake pads"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Field>
          <Field label="Cost">
            <input
              type="number"
              min="0"
              className="input mt-1.5 font-normal"
              value={f.cost}
              onChange={(e) => setF({ ...f, cost: e.target.value })}
            />
          </Field>
          <Field label="Workshop">
            <input
              className="input mt-1.5 font-normal"
              value={f.workshop}
              onChange={(e) => setF({ ...f, workshop: e.target.value })}
            />
          </Field>
          <Field label="Next service due">
            <input
              type="date"
              className="input mt-1.5 font-normal"
              value={f.nextDueDate}
              onChange={(e) => setF({ ...f, nextDueDate: e.target.value })}
            />
          </Field>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        This is the service history. The payment itself is entered under
        Finance, Expenses.
      </p>
      {list.isLoading && (
        <Loader2 className="animate-spin text-slate-400" size={18} />
      )}
      <ul className="max-h-56 divide-y divide-line overflow-y-auto text-sm">
        {list.data?.length === 0 && (
          <li className="py-3 text-slate-500">No records yet.</li>
        )}
        {list.data?.map((m) => (
          <li key={m.id} className="flex justify-between gap-3 py-2">
            <span>
              {m.description}
              <span className="block text-xs text-slate-500">
                {fmtDate(m.serviceDate)}
                {m.workshop ? ` · ${m.workshop}` : ""}
                {m.nextDueDate ? ` · next ${fmtDate(m.nextDueDate)}` : ""}
              </span>
            </span>
            <span className="whitespace-nowrap font-semibold">
              {m.cost ? fmtMoney(m.cost) : ""}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

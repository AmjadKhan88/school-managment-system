import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { dateVal, Driver, Expiry, Modal, Pill, useDrivers } from "./shared";

export default function DriversPage() {
  const can = useAuth((s) => s.can);
  const q = useDrivers();
  const [dialog, setDialog] = useState<Driver | "new" | null>(null);
  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Driver profiles and licence dates."
        actions={
          can("transport", "CREATE") && (
            <button className="btn-primary" onClick={() => setDialog("new")}>
              <Plus size={16} />
              Add driver
            </button>
          )
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Driver",
                "Contact",
                "Licence",
                "Licence valid until",
                "Routes",
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
                  No drivers yet.
                </td>
              </tr>
            )}
            {q.data?.map((d) => (
              <tr
                key={d.id}
                className={cn(
                  "border-b border-line last:border-0",
                  !d.isActive && "text-slate-400",
                )}
              >
                <td className="px-4 py-3 font-semibold">
                  {d.fullName}
                  <span className="block text-xs font-normal text-slate-500">
                    {d.cnic ?? ""}
                  </span>
                </td>
                <td className="px-4 py-3">{d.phone}</td>
                <td className="px-4 py-3">{d.licenseNo ?? "—"}</td>
                <td className="px-4 py-3">
                  <Expiry date={d.licenseExpiry} state={d.licenseState} />
                </td>
                <td className="px-4 py-3 text-xs">
                  {d.routes.join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <Pill on={d.isActive} />
                </td>
                <td className="px-4 py-2 text-right">
                  {can("transport", "EDIT") && (
                    <button
                      className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                      onClick={() => setDialog(d)}
                      aria-label={`Edit ${d.fullName}`}
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
      {dialog && (
        <DriverDialog
          driver={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function DriverDialog({
  driver,
  onClose,
}: {
  driver: Driver | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    fullName: driver?.fullName ?? "",
    phone: driver?.phone ?? "",
    cnic: driver?.cnic ?? "",
    licenseNo: driver?.licenseNo ?? "",
    licenseExpiry: dateVal(driver?.licenseExpiry),
    address: driver?.address ?? "",
    isActive: driver?.isActive ?? true,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      driver
        ? api.put(`/transport/drivers/${driver.id}`, f)
        : api.post("/transport/drivers", f),
    onSuccess: () => {
      toast.success("Driver saved");
      qc.invalidateQueries({ queryKey: ["transport"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal
      title={driver ? "Edit driver" : "Add driver"}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      busy={save.isPending}
    >
      <Field label="Full name *">
        <input
          required
          className="input mt-1.5 font-normal"
          value={f.fullName}
          onChange={set("fullName")}
        />
      </Field>
      <Field label="Phone *">
        <input
          required
          className="input mt-1.5 font-normal"
          value={f.phone}
          onChange={set("phone")}
        />
      </Field>
      <Field label="CNIC">
        <input
          className="input mt-1.5 font-normal"
          placeholder="17301-1234567-1"
          value={f.cnic}
          onChange={set("cnic")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Licence number">
          <input
            className="input mt-1.5 font-normal"
            value={f.licenseNo}
            onChange={set("licenseNo")}
          />
        </Field>
        <Field label="Valid until">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            value={f.licenseExpiry}
            onChange={set("licenseExpiry")}
          />
        </Field>
      </div>
      <Field label="Address">
        <input
          className="input mt-1.5 font-normal"
          value={f.address}
          onChange={set("address")}
        />
      </Field>
      {driver && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={f.isActive}
            onChange={(e) => setF({ ...f, isActive: e.target.checked })}
          />
          Active
        </label>
      )}
    </Modal>
  );
}

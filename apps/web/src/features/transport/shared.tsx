import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/features/students/shared";

export { fmtMoney } from "@/features/fees/shared";

export const dateVal = (s: string | null | undefined) =>
  s ? s.slice(0, 10) : "";

export interface Vehicle {
  id: string;
  vehicleNo: string;
  make: string | null;
  model: string | null;
  year: number | null;
  capacity: number;
  status: "ACTIVE" | "MAINTENANCE" | "RETIRED";
  notes: string | null;
  registrationExpiry: string | null;
  insuranceExpiry: string | null;
  registrationState: string | null;
  insuranceState: string | null;
  routes: string[];
  assigned: number;
}
export interface Driver {
  id: string;
  fullName: string;
  phone: string;
  cnic: string | null;
  licenseNo: string | null;
  licenseExpiry: string | null;
  licenseState: string | null;
  address: string | null;
  isActive: boolean;
  routes: string[];
}
export interface RouteRow {
  id: string;
  name: string;
  vehicle: { id: string; vehicleNo: string; capacity: number } | null;
  driver: { id: string; fullName: string; phone: string } | null;
  morningTime: string | null;
  afternoonTime: string | null;
  notes: string | null;
  isActive: boolean;
  stops: number;
  students: number;
}
export interface Stop {
  id: string;
  routeId: string;
  routeName: string;
  name: string;
  sortOrder: number;
  pickupTime: string | null;
  monthlyFee: string;
  isActive: boolean;
  students: number;
}

export const useVehicles = () =>
  useQuery({
    queryKey: ["transport", "vehicles"],
    queryFn: async () =>
      (await api.get<{ data: Vehicle[] }>("/transport/vehicles")).data.data,
  });
export const useDrivers = () =>
  useQuery({
    queryKey: ["transport", "drivers"],
    queryFn: async () =>
      (await api.get<{ data: Driver[] }>("/transport/drivers")).data.data,
  });
export const useRoutes = () =>
  useQuery({
    queryKey: ["transport", "routes"],
    queryFn: async () =>
      (await api.get<{ data: RouteRow[] }>("/transport/routes")).data.data,
  });

/** A date that turns amber when it is close and red once it has passed. */
export function Expiry({
  date,
  state,
}: {
  date: string | null;
  state: string | null;
}) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={cn(
        "whitespace-nowrap",
        state === "EXPIRED" && "font-semibold text-rose-600",
        state === "SOON" && "font-semibold text-amber-600",
      )}
    >
      {fmtDate(date)}
      {state === "EXPIRED" ? " (expired)" : state === "SOON" ? " (soon)" : ""}
    </span>
  );
}

export const Pill = ({
  on,
  yes = "Active",
  no = "Inactive",
}: {
  on: boolean;
  yes?: string;
  no?: string;
}) => (
  <span
    className={cn(
      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
      on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
    )}
  >
    {on ? yes : no}
  </span>
);

/** The dialog every transport form uses. */
export function Modal({
  title,
  onClose,
  onSubmit,
  busy,
  submitLabel = "Save",
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
  submitLabel?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className={cn("card w-full p-6", wide ? "max-w-2xl" : "max-w-md")}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

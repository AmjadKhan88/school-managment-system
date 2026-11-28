import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { useRoutes } from "./shared";

type Status = "BOARDED" | "ABSENT";
interface Roster {
  route: string;
  recorded: boolean;
  students: {
    studentId: string;
    name: string;
    admissionNo: string;
    stop: string;
    pickupTime: string | null;
    status: Status | null;
  }[];
}

export default function TransportAttendancePage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const routes = useRoutes();
  const [routeId, setRouteId] = useState("");
  const [date, setDate] = useState(localToday());
  const [trip, setTrip] = useState<"MORNING" | "AFTERNOON">("MORNING");
  const [marks, setMarks] = useState<Record<string, Status>>({});

  const q = useQuery({
    queryKey: ["transport", "attendance", routeId, date, trip],
    enabled: !!routeId,
    queryFn: async () =>
      (
        await api.get<{ data: Roster }>("/transport/attendance", {
          params: { routeId, date, trip },
        })
      ).data.data,
  });
  const d = q.data;
  const status = (id: string, saved: Status | null): Status =>
    marks[id] ?? saved ?? "BOARDED";
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setMarks({});
    };

  const save = useMutation({
    mutationFn: () =>
      api.post("/transport/attendance", {
        routeId,
        date,
        trip,
        records: d!.students.map((s) => ({
          studentId: s.studentId,
          status: status(s.studentId, s.status),
        })),
      }),
    onSuccess: () => {
      toast.success("Attendance saved");
      setMarks({});
      qc.invalidateQueries({ queryKey: ["transport", "attendance"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const boarded =
    d?.students.filter((s) => status(s.studentId, s.status) === "BOARDED")
      .length ?? 0;

  return (
    <>
      <PageHeader
        title="Transport Attendance"
        subtitle="Who got on the bus, for each trip."
      />
      <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Route">
          <select
            className="input mt-1.5 font-normal"
            value={routeId}
            onChange={(e) => change(setRouteId)(e.target.value)}
          >
            <option value="">Select…</option>
            {routes.data
              ?.filter((r) => r.isActive)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            max={localToday()}
            className="input mt-1.5 font-normal"
            value={date}
            onChange={(e) => change(setDate)(e.target.value)}
          />
        </Field>
        <Field label="Trip">
          <select
            className="input mt-1.5 font-normal"
            value={trip}
            onChange={(e) =>
              change(setTrip)(e.target.value as "MORNING" | "AFTERNOON")
            }
          >
            <option value="MORNING">Morning (to school)</option>
            <option value="AFTERNOON">Afternoon (home)</option>
          </select>
        </Field>
      </div>

      {!routeId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a route.
        </div>
      )}
      {q.isLoading && routeId && (
        <Loader2 className="mx-auto mt-6 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load")}
        </div>
      )}
      {d && d.students.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No students are assigned to {d.route} on this date.
        </div>
      )}

      {d && d.students.length > 0 && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">
              {d.route}:{" "}
              <span className="text-emerald-700">{boarded} boarded</span> ·{" "}
              <span className="text-rose-600">
                {d.students.length - boarded} absent
              </span>
              {d.recorded && (
                <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                  Already recorded. Saving updates it.
                </span>
              )}
            </p>
            {can("transport", "CREATE") && (
              <div className="flex gap-2">
                <button
                  className="btn border border-slate-300 py-1.5"
                  onClick={() =>
                    setMarks(
                      Object.fromEntries(
                        d.students.map((s) => [
                          s.studentId,
                          "BOARDED" as Status,
                        ]),
                      ),
                    )
                  }
                >
                  All boarded
                </button>
                <button
                  className="btn-primary py-1.5"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  Save
                </button>
              </div>
            )}
          </div>
          <ul className="divide-y divide-line">
            {d.students.map((s) => {
              const st = status(s.studentId, s.status);
              return (
                <li
                  key={s.studentId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-semibold">{s.name}</span>
                    <span className="block text-xs text-slate-500">
                      {s.admissionNo} · {s.stop}
                      {s.pickupTime ? ` ${s.pickupTime}` : ""}
                    </span>
                  </span>
                  <div role="group" className="flex gap-1">
                    {(["BOARDED", "ABSENT"] as Status[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={st === v}
                        disabled={!can("transport", "CREATE")}
                        onClick={() => setMarks({ ...marks, [s.studentId]: v })}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                          st === v
                            ? v === "BOARDED"
                              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                              : "border-rose-600 bg-rose-50 text-rose-700"
                            : "border-slate-200 text-slate-500",
                        )}
                      >
                        {v === "BOARDED" ? "Boarded" : "Absent"}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

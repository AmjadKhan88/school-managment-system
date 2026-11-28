import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { localToday } from "@/features/finance/shared";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { fmtMoney, Modal, Stop, useRoutes } from "./shared";

interface Assignment {
  id: string;
  status: "ACTIVE" | "ENDED";
  student: { id: string; name: string; admissionNo: string };
  className: string | null;
  route: { id: string; name: string };
  stop: { id: string; name: string };
  monthlyFee: string;
  feeNote: string | null;
  startDate: string;
  endDate: string | null;
  endReason: string | null;
}
interface Paged {
  items: Assignment[];
  total: number;
  page: number;
  pageSize: number;
}
interface Found {
  id: string;
  name: string;
  detail: string;
}

export default function AssignmentsPage() {
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [routeId, setRouteId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<
    { kind: "assign" } | { kind: "move" | "end"; a: Assignment } | null
  >(null);
  const dq = useDebounced(q);
  const routes = useRoutes();
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const params = {
    q: dq || undefined,
    routeId: routeId || undefined,
    status: status || undefined,
    page,
    pageSize: 25,
  };
  const list = useQuery({
    queryKey: ["transport", "assignments", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/transport/assignments", { params }))
        .data.data,
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Student Transport Assignment"
        subtitle="Who travels on which route. The fee is added to their monthly voucher."
        actions={
          can("transport", "CREATE") && (
            <button
              className="btn-primary"
              onClick={() => setDialog({ kind: "assign" })}
            >
              <Plus size={16} />
              Assign student
            </button>
          )
        }
      />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Student name or admission no"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={routeId}
          onChange={(e) => reset(setRouteId)(e.target.value)}
          aria-label="Route"
        >
          <option value="">All routes</option>
          {routes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          aria-label="Status"
        >
          <option value="">Current and ended</option>
          <option value="ACTIVE">Current</option>
          <option value="ENDED">Ended</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Student",
                "Class",
                "Route and stop",
                "Monthly fee",
                "Since",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {list.isError && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load")}
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No assignments match.
                </td>
              </tr>
            )}
            {d?.items.map((a) => (
              <tr
                key={a.id}
                className={cn(
                  "border-b border-line last:border-0",
                  a.status === "ENDED" && "text-slate-400",
                )}
              >
                <td className="px-4 py-3 font-semibold">
                  {a.student.name}
                  <span className="block text-xs font-normal text-slate-500">
                    {a.student.admissionNo}
                  </span>
                </td>
                <td className="px-4 py-3">{a.className ?? "—"}</td>
                <td className="px-4 py-3">
                  {a.route.name}
                  <span className="block text-xs text-slate-500">
                    {a.stop.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {fmtMoney(a.monthlyFee)}
                  {a.feeNote && (
                    <span className="block text-xs text-slate-500">
                      {a.feeNote}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtDate(a.startDate)}
                  {a.endDate && (
                    <span className="block text-xs">
                      to {fmtDate(a.endDate)}
                      {a.endReason ? ` · ${a.endReason}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {a.status === "ACTIVE" && can("transport", "EDIT") && (
                    <div className="inline-flex gap-1">
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        onClick={() => setDialog({ kind: "move", a })}
                      >
                        Move
                      </button>
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        onClick={() => setDialog({ kind: "end", a })}
                      >
                        End
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && d.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(d.page - 1) * d.pageSize + 1}–
              {Math.min(d.page * d.pageSize, d.total)} of {d.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2">
                Page {page} of {pages}
              </span>
              <button
                className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {dialog?.kind === "assign" && (
        <PlaceDialog title="Assign a student" onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "move" && (
        <PlaceDialog
          title={`Move ${dialog.a.student.name}`}
          current={dialog.a}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "end" && (
        <EndDialog a={dialog.a} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

/** Pick (or change) route, stop, fee and start date. Used for a new assignment and for moving one. */
function PlaceDialog({
  title,
  current,
  onClose,
}: {
  title: string;
  current?: Assignment;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const routes = useRoutes();
  const [search, setSearch] = useState("");
  const [student, setStudent] = useState<Found | null>(null);
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [start, setStart] = useState(localToday());
  const ds = useDebounced(search.trim());

  const found = useQuery({
    queryKey: ["transport", "student-search", ds],
    enabled: !current && ds.length >= 2 && !student,
    queryFn: async () =>
      (
        await api.get<{ data: Found[] }>("/transport/student-search", {
          params: { q: ds },
        })
      ).data.data,
  });
  const stops = useQuery({
    queryKey: ["transport", "stops", routeId],
    enabled: !!routeId,
    queryFn: async () =>
      (
        await api.get<{ data: Stop[] }>("/transport/stops", {
          params: { routeId },
        })
      ).data.data,
  });
  const chosen = stops.data?.find((s) => s.id === stopId);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        stopId,
        monthlyFee: fee || undefined,
        feeNote: note || undefined,
        startDate: start,
      };
      return current
        ? api.post(`/transport/assignments/${current.id}/move`, body)
        : api.post("/transport/assignments", {
            studentId: student!.id,
            ...body,
          });
    },
    onSuccess: () => {
      toast.success(current ? "Moved" : "Assigned");
      qc.invalidateQueries({ queryKey: ["transport"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <Modal
      title={title}
      onClose={onClose}
      onSubmit={() => (student || current) && stopId && save.mutate()}
      busy={save.isPending}
      submitLabel={current ? "Move" : "Assign"}
    >
      {!current &&
        (student ? (
          <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
            <span>
              <strong>{student.name}</strong> · {student.detail}
            </span>
            <button
              type="button"
              className="text-xs font-semibold text-brand-700 hover:underline"
              onClick={() => setStudent(null)}
            >
              Change
            </button>
          </div>
        ) : (
          <div>
            <Field label="Student *">
              <input
                autoFocus
                className="input mt-1.5 font-normal"
                placeholder="Name or admission number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <ul className="mt-2 space-y-1">
              {found.data?.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => setStudent(f)}
                  >
                    <span className="font-semibold">{f.name}</span>
                    <span className="block text-xs text-slate-500">
                      {f.detail}
                    </span>
                  </button>
                </li>
              ))}
              {found.data?.length === 0 && (
                <li className="px-1 text-sm text-slate-500">Nobody found.</li>
              )}
            </ul>
          </div>
        ))}
      {current && (
        <p className="text-sm text-slate-600">
          Now on <strong>{current.route.name}</strong>, {current.stop.name}, at{" "}
          {fmtMoney(current.monthlyFee)} a month. The current assignment ends
          the day before the new one starts.
        </p>
      )}
      <Field label="Route *">
        <select
          required
          className="input mt-1.5 font-normal"
          value={routeId}
          onChange={(e) => {
            setRouteId(e.target.value);
            setStopId("");
            setFee("");
          }}
        >
          <option value="">Select…</option>
          {routes.data
            ?.filter((r) => r.isActive)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.vehicle
                  ? ` (${r.students}/${r.vehicle.capacity} seats)`
                  : ""}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Stop *">
        <select
          required
          className="input mt-1.5 font-normal"
          disabled={!routeId}
          value={stopId}
          onChange={(e) => {
            setStopId(e.target.value);
            setFee("");
          }}
        >
          <option value="">Select…</option>
          {stops.data
            ?.filter((s) => s.isActive)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {fmtMoney(s.monthlyFee)}
              </option>
            ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={`Monthly fee${chosen ? ` (stop: ${fmtMoney(chosen.monthlyFee)})` : ""}`}
        >
          <input
            type="number"
            min="0"
            step="0.01"
            className="input mt-1.5 font-normal"
            placeholder={chosen ? "same as stop" : ""}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </Field>
        <Field label="Starts on">
          <input
            type="date"
            className="input mt-1.5 font-normal"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Note about a special fee">
        <input
          className="input mt-1.5 font-normal"
          placeholder="optional, for example sibling discount"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

function EndDialog({ a, onClose }: { a: Assignment; onClose: () => void }) {
  const qc = useQueryClient();
  const [endDate, setEndDate] = useState(localToday());
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api.post(`/transport/assignments/${a.id}/end`, { endDate, reason }),
    onSuccess: () => {
      toast.success("Assignment ended");
      qc.invalidateQueries({ queryKey: ["transport"] });
      onClose();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Modal
      title={`End transport: ${a.student.name}`}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      busy={save.isPending}
      submitLabel="End assignment"
    >
      <p className="text-sm text-slate-600">
        {a.route.name}, {a.stop.name}. The month containing the end date is
        still billed in full.
      </p>
      <Field label="Last day of transport *">
        <input
          required
          type="date"
          min={a.startDate.slice(0, 10)}
          className="input mt-1.5 font-normal"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </Field>
      <Field label="Reason *">
        <input
          required
          minLength={3}
          className="input mt-1.5 font-normal"
          placeholder="Family moved, now walks to school…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

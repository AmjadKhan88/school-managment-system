import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Stop } from "./shared";

export default function TransportFeesPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [apply, setApply] = useState(true);
  const q = useQuery({
    queryKey: ["transport", "stops", "all"],
    queryFn: async () =>
      (await api.get<{ data: Stop[] }>("/transport/stops")).data.data,
  });
  const save = useMutation({
    mutationFn: (v: { id: string; monthlyFee: number }) =>
      api.put<{ data: { updatedStudents: number } }>(
        `/transport/stops/${v.id}/fee`,
        { monthlyFee: v.monthlyFee, applyToStudents: apply },
      ),
    onSuccess: (r, v) => {
      toast.success(
        `Fee saved${r.data.data.updatedStudents ? `. ${r.data.data.updatedStudents} student${r.data.data.updatedStudents === 1 ? "" : "s"} moved to the new fee` : ""}`,
      );
      setDraft((d) => {
        const n = { ...d };
        delete n[v.id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["transport"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const groups = [...new Set(q.data?.map((s) => s.routeName))];

  return (
    <>
      <PageHeader
        title="Transport Fees"
        subtitle="The monthly fee of each stop. It appears as the Transport Fee line on monthly vouchers."
      />
      <div className="card mb-4 p-4 text-sm text-slate-600">
        <p>
          Each student keeps their own copy of the fee, so a changed stop fee
          does not touch students unless you tick the box below. Students with a
          special fee are never changed. Change one student's fee under{" "}
          <Link
            to="/transport/assignments"
            className="font-semibold text-brand-700 hover:underline"
          >
            Student Transport Assignment
          </Link>
          .
        </p>
        <label className="mt-3 flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={apply}
            onChange={(e) => setApply(e.target.checked)}
          />
          Also move students who are on the old stop fee to the new fee
        </label>
        <p className="mt-2 text-xs">
          New fees apply to vouchers generated from now on. Vouchers already
          issued do not change.
        </p>
      </div>
      {q.isLoading && (
        <Loader2 className="mx-auto mt-6 animate-spin text-slate-400" />
      )}
      {groups.length === 0 && q.data && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Add routes and stops first.
        </div>
      )}
      <div className="grid gap-4">
        {groups.map((g) => (
          <section key={g} className="card overflow-x-auto">
            <h2 className="border-b border-line px-4 py-3 text-sm font-bold text-ink-950">
              {g}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {q
                  .data!.filter((s) => s.routeName === g)
                  .map((s) => {
                    const v = draft[s.id] ?? s.monthlyFee;
                    const changed =
                      draft[s.id] !== undefined &&
                      Number(draft[s.id]) !== Number(s.monthlyFee);
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-3 font-semibold">
                          {s.name}
                          {!s.isActive && (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              not in use
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {s.students} student{s.students === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Fee for ${s.name}`}
                            disabled={!can("transport", "EDIT")}
                            className="input w-32"
                            value={v}
                            onChange={(e) =>
                              setDraft({ ...draft, [s.id]: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          {changed && (
                            <button
                              className="btn-primary py-1.5"
                              disabled={save.isPending || draft[s.id] === ""}
                              onClick={() =>
                                save.mutate({
                                  id: s.id,
                                  monthlyFee: Number(draft[s.id]),
                                })
                              }
                            >
                              Save
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </>
  );
}

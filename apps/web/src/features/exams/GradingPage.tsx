import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";

interface Band {
  grade: string;
  minPercent: number;
  gradePoint: number;
  remark: string | null;
  from: number;
  to: number;
}
interface Scale {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  examCount: number;
  bands: Band[];
}
interface RowForm {
  grade: string;
  minPercent: string;
  gradePoint: string;
  remark: string;
}

const toForm = (s: Scale): RowForm[] =>
  s.bands.map((b) => ({
    grade: b.grade,
    minPercent: String(b.minPercent),
    gradePoint: String(b.gradePoint),
    remark: b.remark ?? "",
  }));

/** Same rules as the server, so mistakes show before saving. */
function problems(rows: RowForm[]) {
  const out: string[] = [];
  const mins = rows.map((r) => Number(r.minPercent));
  const names = rows.map((r) => r.grade.trim().toLowerCase());
  if (rows.length === 0) out.push("Add at least one grade");
  if (names.some((n) => !n)) out.push("Every grade needs a name");
  if (new Set(names).size !== names.length)
    out.push("Two grades have the same name");
  if (mins.some((m) => isNaN(m) || m < 0 || m > 100))
    out.push("Percentages must be between 0 and 100");
  if (new Set(mins).size !== mins.length)
    out.push("Two grades start at the same percentage");
  if (!mins.includes(0)) out.push("The lowest grade must start at 0%");
  if (
    rows.some(
      (r) =>
        isNaN(Number(r.gradePoint)) ||
        Number(r.gradePoint) < 0 ||
        Number(r.gradePoint) > 10,
    )
  )
    out.push("Grade points must be between 0 and 10");
  return out;
}

export default function GradingPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<RowForm[]>([]);
  const [test, setTest] = useState("");

  const scales = useQuery({
    queryKey: ["grading", "scales"],
    queryFn: async () =>
      (await api.get<{ data: Scale[] }>("/grading/scales")).data.data,
  });
  const current =
    scales.data?.find((s) => s.id === selected) ?? scales.data?.[0];

  useEffect(() => {
    if (current) {
      setSelected(current.id);
      setName(current.name);
      setRows(toForm(current));
    }
  }, [current?.id, scales.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: ["grading"] });
  const canEdit = can("academics", "EDIT");
  const errs = problems(rows);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/grading/scales/${current!.id}`, {
        name,
        bands: rows.map((r) => ({
          grade: r.grade,
          minPercent: Number(r.minPercent),
          gradePoint: Number(r.gradePoint),
          remark: r.remark || undefined,
        })),
      }),
    onSuccess: () => {
      toast.success("Grading scale saved");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const create = useMutation({
    mutationFn: (newName: string) =>
      api.post<{ data: { id: string } }>("/grading/scales", {
        name: newName,
        bands: rows.map((r) => ({
          grade: r.grade,
          minPercent: Number(r.minPercent),
          gradePoint: Number(r.gradePoint),
          remark: r.remark || undefined,
        })),
      }),
    onSuccess: (res) => {
      toast.success("Scale created");
      setSelected(res.data.data.id);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const makeDefault = useMutation({
    mutationFn: () => api.post(`/grading/scales/${current!.id}/default`),
    onSuccess: () => {
      toast.success("Default scale changed");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/grading/scales/${current!.id}`),
    onSuccess: () => {
      toast.success("Scale deleted");
      setSelected("");
      refresh();
    },
    onError: (e) =>
      toast.error(apiMessage(e, "Cannot delete: an exam uses this scale")),
  });

  const setRow = (i: number, patch: Partial<RowForm>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const sorted = [...rows]
    .map((r) => ({ ...r, min: Number(r.minPercent) }))
    .filter((r) => !isNaN(r.min))
    .sort((a, b) => b.min - a.min);
  const rangeOf = (min: number) => {
    const i = sorted.findIndex((r) => r.min === min);
    return `${min}% – ${i <= 0 ? 100 : Math.round((sorted[i - 1].min - 0.01) * 100) / 100}%`;
  };
  const testResult =
    test !== "" && !isNaN(Number(test))
      ? sorted.find((r) => Number(test) >= r.min)
      : undefined;

  const newScale = () => {
    const n = window.prompt(
      "Name for the new grading scale (it starts as a copy of the grades shown):",
    );
    if (n && n.trim().length >= 2) create.mutate(n.trim());
  };

  return (
    <>
      <PageHeader
        title="Grading System"
        subtitle="Each grade starts at a minimum percentage and runs up to the next grade. The lowest grade must start at 0%."
        actions={
          can("academics", "CREATE") && (
            <button
              className="btn-primary"
              onClick={newScale}
              disabled={errs.length > 0 || create.isPending}
            >
              <Plus size={16} />
              New scale
            </button>
          )
        }
      />

      {scales.isLoading && (
        <Loader2 className="mx-auto mt-10 animate-spin text-slate-400" />
      )}
      {scales.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(scales.error, "Could not load grading scales")}
        </div>
      )}

      {scales.data && current && (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="card h-fit overflow-hidden">
            {scales.data.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`flex w-full items-center justify-between gap-2 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${current.id === s.id ? "bg-brand-50" : ""}`}
              >
                <span className="font-semibold">{s.name}</span>
                {s.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <Star size={11} />
                    Default
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Field label="Scale name" className="w-64">
                <input
                  className="input mt-1.5 font-normal"
                  disabled={!canEdit}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                {!current.isDefault && canEdit && (
                  <button
                    className="btn border border-slate-300"
                    onClick={() => makeDefault.mutate()}
                    disabled={makeDefault.isPending}
                  >
                    <Star size={15} />
                    Make default
                  </button>
                )}
                {!current.isDefault && can("academics", "DELETE") && (
                  <button
                    className="btn border border-rose-300 text-rose-600"
                    onClick={() =>
                      window.confirm(`Delete the scale "${current.name}"?`) &&
                      remove.mutate()
                    }
                    disabled={remove.isPending}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Used by {current.examCount} exam
              {current.examCount === 1 ? "" : "s"}. Exams with no scale chosen
              use the default.
            </p>

            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="py-2 pr-2">Grade</th>
                  <th className="py-2 pr-2">Starts at (%)</th>
                  <th className="py-2 pr-2">Range</th>
                  <th className="py-2 pr-2">Grade point</th>
                  <th className="py-2 pr-2">Remark</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2 pr-2">
                      <input
                        className="input w-20 py-1.5"
                        disabled={!canEdit}
                        value={r.grade}
                        onChange={(e) => setRow(i, { grade: e.target.value })}
                        aria-label="Grade"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className="input w-24 py-1.5"
                        disabled={!canEdit}
                        value={r.minPercent}
                        onChange={(e) =>
                          setRow(i, { minPercent: e.target.value })
                        }
                        aria-label="Minimum percent"
                      />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-slate-500">
                      {r.minPercent !== "" && !isNaN(Number(r.minPercent))
                        ? rangeOf(Number(r.minPercent))
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        className="input w-24 py-1.5"
                        disabled={!canEdit}
                        value={r.gradePoint}
                        onChange={(e) =>
                          setRow(i, { gradePoint: e.target.value })
                        }
                        aria-label="Grade point"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="input py-1.5"
                        disabled={!canEdit}
                        value={r.remark}
                        onChange={(e) => setRow(i, { remark: e.target.value })}
                        aria-label="Remark"
                      />
                    </td>
                    <td className="py-2">
                      {canEdit && rows.length > 1 && (
                        <button
                          type="button"
                          className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                          aria-label="Remove grade"
                          onClick={() =>
                            setRows((rs) => rs.filter((_, idx) => idx !== i))
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && rows.length < 15 && (
              <button
                type="button"
                className="btn mt-3 border border-slate-300 py-1.5"
                onClick={() =>
                  setRows((rs) => [
                    ...rs,
                    { grade: "", minPercent: "", gradePoint: "", remark: "" },
                  ])
                }
              >
                <Plus size={15} />
                Add grade
              </button>
            )}

            {errs.length > 0 && (
              <ul className="mt-4 list-disc space-y-0.5 rounded-lg bg-rose-50 p-3 pl-7 text-sm text-rose-700">
                {errs.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                Try a percentage
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="input w-24 py-1.5 font-normal"
                  value={test}
                  onChange={(e) => setTest(e.target.value)}
                />
              </label>
              <span className="text-sm">
                {testResult ? (
                  <>
                    Grade <strong>{testResult.grade}</strong>,{" "}
                    {testResult.gradePoint} points
                    {testResult.remark ? ` (${testResult.remark})` : ""}
                  </>
                ) : (
                  "Enter a percentage to see its grade."
                )}
              </span>
            </div>

            {canEdit && (
              <div className="mt-5 flex justify-end">
                <button
                  className="btn-primary px-6"
                  disabled={errs.length > 0 || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  Save scale
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

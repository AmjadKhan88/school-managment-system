import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";

interface Cls {
  id: string;
  name: string;
  level: number;
}
interface Subj {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}
interface Mapped {
  subjectId: string;
}

export default function ClassSubjectsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [classId, setClassId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const classes = useQuery({
    queryKey: ["/academics/classes"],
    queryFn: async () =>
      (await api.get<{ data: Cls[] }>("/academics/classes")).data.data,
  });
  const subjects = useQuery({
    queryKey: ["/academics/subjects"],
    queryFn: async () =>
      (await api.get<{ data: Subj[] }>("/academics/subjects")).data.data,
  });
  const mapped = useQuery({
    queryKey: ["/academics/classes", classId, "subjects"],
    enabled: !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: Mapped[] }>(
          `/academics/classes/${classId}/subjects`,
        )
      ).data.data,
  });

  // Load the saved mapping into the checkboxes whenever a class is chosen.
  useEffect(() => {
    if (mapped.data) setSelected(new Set(mapped.data.map((m) => m.subjectId)));
  }, [mapped.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/academics/classes/${classId}/subjects`, {
        subjectIds: [...selected],
      }),
    onSuccess: () => {
      toast.success("Subjects saved for this class");
      qc.invalidateQueries({
        queryKey: ["/academics/classes", classId, "subjects"],
      });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Show active subjects, plus any inactive one already assigned (so it isn't silently dropped on save).
  const visible =
    subjects.data?.filter((s) => s.isActive || selected.has(s.id)) ?? [];

  return (
    <>
      <PageHeader
        title="Class-Subject Mapping"
        subtitle="Choose which subjects each class studies."
      />

      <div className="card p-5 sm:p-6">
        <label className="block max-w-sm text-sm font-semibold">
          Class
          <select
            className="input mt-1.5 font-normal"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSelected(new Set());
            }}
          >
            <option value="">Select a class…</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {!classId && (
          <p className="mt-6 text-sm text-slate-500">
            Pick a class to see and edit its subjects.
          </p>
        )}

        {classId && (mapped.isLoading || subjects.isLoading) && (
          <Loader2 className="mt-6 animate-spin text-slate-400" size={20} />
        )}

        {classId && mapped.isSuccess && (
          <>
            {visible.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                No subjects exist yet. Add some under Subjects first.
              </p>
            ) : (
              <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-rose-500"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      disabled={!can("academics", "EDIT")}
                    />
                    <span className="font-semibold">{s.name}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {s.code}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {can("academics", "EDIT") && visible.length > 0 && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {selected.size} selected
                </p>
                <button
                  className="btn-primary"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  Save subjects
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

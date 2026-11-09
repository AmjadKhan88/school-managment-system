import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
}
export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
}

interface Props<T extends { id: string }> {
  title: string;
  subtitle: string;
  endpoint: string;
  noun: string;
  columns: Column<T>[];
  fields: Field[];
  toForm?: (row: T) => Record<string, string>;
  toPayload?: (v: Record<string, string>) => unknown;
  extraActions?: (row: T) => React.ReactNode;
  onChanged?: () => void; // called after a successful save or delete
  allowDelete?: boolean; // default true; sessions pass false
}

export function CrudPage<T extends { id: string }>(p: Props<T>) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: [p.endpoint],
    queryFn: async () => (await api.get<{ data: T[] }>(p.endpoint)).data.data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = p.toPayload ? p.toPayload(values) : values;
      return editing === "new"
        ? api.post(p.endpoint, payload)
        : api.put(`${p.endpoint}/${(editing as T).id}`, payload);
    },
    onSuccess: () => {
      toast.success(`${p.noun} saved`);
      setEditing(null);
      qc.invalidateQueries({ queryKey: [p.endpoint] });
      p.onChanged?.();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${p.endpoint}/${id}`),
    onSuccess: () => {
      toast.success(`${p.noun} deleted`);
      qc.invalidateQueries({ queryKey: [p.endpoint] });
      p.onChanged?.();
    },
    onError: (e) =>
      toast.error(apiMessage(e, "Cannot delete: this record is in use")),
  });

  const open = (row: T | "new") => {
    setValues(
      row === "new"
        ? {}
        : p.toForm
          ? p.toForm(row)
          : Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, String(v ?? "")]),
            ),
    );
    setEditing(row);
  };

  const colSpan = p.columns.length + 1;

  return (
    <>
      <PageHeader
        title={p.title}
        subtitle={p.subtitle}
        actions={
          can("academics", "CREATE") && (
            <button className="btn-primary" onClick={() => open("new")}>
              <Plus size={16} />
              Add {p.noun.toLowerCase()}
            </button>
          )
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {p.columns.map((c) => (
                <th key={c.header} className="px-4 py-3">
                  {c.header}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  <Loader2 className="mx-auto animate-spin" size={18} />
                </td>
              </tr>
            )}
            {list.isError && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load data")}
                </td>
              </tr>
            )}
            {list.data?.length === 0 && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No {p.noun.toLowerCase()} records yet. Add the first one.
                </td>
              </tr>
            )}
            {list.data?.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                {p.columns.map((c) => (
                  <td key={c.header} className="px-4 py-3">
                    {c.render(row)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {p.extraActions?.(row)}
                    {can("academics", "EDIT") && (
                      <button
                        onClick={() => open(row)}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {p.allowDelete !== false && can("academics", "DELETE") && (
                      <button
                        onClick={() =>
                          window.confirm(
                            `Delete this ${p.noun.toLowerCase()}?`,
                          ) && remove.mutate(row.id)
                        }
                        className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                        aria-label="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="card w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing === "new" ? "Add" : "Edit"} {p.noun.toLowerCase()}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {p.fields.map((f) => (
                <label key={f.name} className="block text-sm font-semibold">
                  {f.label}
                  {f.type === "select" ? (
                    <select
                      className="input mt-1.5 font-normal"
                      required={f.required !== false}
                      value={values[f.name] ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [f.name]: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input mt-1.5 font-normal"
                      type={f.type ?? "text"}
                      required={f.required !== false}
                      value={values[f.name] ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [f.name]: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={save.isPending}>
                {save.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

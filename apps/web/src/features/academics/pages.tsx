import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { api, apiMessage, silentRefresh } from "@/lib/api";
import { CrudPage } from "./CrudPage";

const Badge = ({ on }: { on: boolean }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
  >
    {on ? "Active" : "Inactive"}
  </span>
);
const day = (d: string) => new Date(d).toLocaleDateString();
const iso = (d: string) => d?.slice(0, 10) ?? "";

// Re-reads /auth/me data so the top-bar session dropdown shows the new list.
const refreshProfile = () => {
  silentRefresh().catch(() => undefined);
};

// ---------------- Sessions ----------------
interface Session {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export function SessionsPage() {
  const qc = useQueryClient();
  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/academics/sessions/${id}/activate`),
    onSuccess: () => {
      toast.success("Session activated");
      qc.invalidateQueries({ queryKey: ["/academics/sessions"] });
      refreshProfile();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <CrudPage<Session>
      title="Academic Sessions"
      subtitle="One session is active for daily operations. Past sessions stay intact."
      endpoint="/academics/sessions"
      noun="Session"
      onChanged={refreshProfile}
      columns={[
        {
          header: "Session",
          render: (r) => <span className="font-semibold">{r.name}</span>,
        },
        { header: "Start", render: (r) => day(r.startDate) },
        { header: "End", render: (r) => day(r.endDate) },
        { header: "Status", render: (r) => <Badge on={r.isActive} /> },
      ]}
      fields={[
        { name: "name", label: "Session name (e.g. 2027-28)" },
        { name: "startDate", label: "Start date", type: "date" },
        { name: "endDate", label: "End date", type: "date" },
      ]}
      toForm={(r) => ({
        name: r.name,
        startDate: iso(r.startDate),
        endDate: iso(r.endDate),
      })}
      extraActions={(r) =>
        !r.isActive && (
          <button
            onClick={() => activate.mutate(r.id)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            <CheckCircle2 size={14} />
            Activate
          </button>
        )
      }
    />
  );
}

// ---------------- Classes ----------------
interface Cls {
  id: string;
  name: string;
  level: number;
  isActive: boolean;
  _count: { sections: number };
}

export const ClassesPage = () => (
  <CrudPage<Cls>
    title="Classes"
    subtitle="Level sets the promotion order: level 1 is promoted to level 2."
    endpoint="/academics/classes"
    noun="Class"
    columns={[
      { header: "Level", render: (r) => r.level },
      {
        header: "Class",
        render: (r) => <span className="font-semibold">{r.name}</span>,
      },
      { header: "Sections", render: (r) => r._count.sections },
      { header: "Status", render: (r) => <Badge on={r.isActive} /> },
    ]}
    fields={[
      { name: "name", label: "Class name" },
      { name: "level", label: "Level (promotion order)", type: "number" },
    ]}
    toPayload={(v) => ({ name: v.name, level: Number(v.level) })}
  />
);

// ---------------- Sections ----------------
interface Sec {
  id: string;
  name: string;
  classId: string;
  capacity: number;
  isActive: boolean;
  class: { name: string };
}

export function SectionsPage() {
  const classes = useQuery({
    queryKey: ["/academics/classes"],
    queryFn: async () =>
      (await api.get<{ data: Cls[] }>("/academics/classes")).data.data,
  });

  return (
    <CrudPage<Sec>
      title="Sections"
      subtitle="Sections belong to a class and have a seat capacity."
      endpoint="/academics/sections"
      noun="Section"
      columns={[
        { header: "Class", render: (r) => r.class.name },
        {
          header: "Section",
          render: (r) => <span className="font-semibold">{r.name}</span>,
        },
        { header: "Capacity", render: (r) => r.capacity },
        { header: "Status", render: (r) => <Badge on={r.isActive} /> },
      ]}
      fields={[
        {
          name: "classId",
          label: "Class",
          type: "select",
          options: classes.data?.map((c) => ({ value: c.id, label: c.name })),
        },
        { name: "name", label: "Section name (e.g. A)" },
        { name: "capacity", label: "Capacity", type: "number" },
      ]}
      toForm={(r) => ({
        classId: r.classId,
        name: r.name,
        capacity: String(r.capacity),
      })}
      toPayload={(v) => ({
        classId: v.classId,
        name: v.name,
        capacity: Number(v.capacity),
      })}
    />
  );
}

// ---------------- Subjects ----------------
interface Subj {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export const SubjectsPage = () => (
  <CrudPage<Subj>
    title="Subjects"
    subtitle="The subject catalogue. Assign subjects to classes under Class-Subject Mapping."
    endpoint="/academics/subjects"
    noun="Subject"
    columns={[
      { header: "Code", render: (r) => r.code },
      {
        header: "Subject",
        render: (r) => <span className="font-semibold">{r.name}</span>,
      },
      { header: "Status", render: (r) => <Badge on={r.isActive} /> },
    ]}
    fields={[
      { name: "name", label: "Subject name" },
      { name: "code", label: "Code (e.g. MATH)" },
    ]}
  />
);

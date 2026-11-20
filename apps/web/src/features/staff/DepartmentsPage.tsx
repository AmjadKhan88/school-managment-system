import { CrudPage } from "@/features/academics/CrudPage";

interface Department {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default function DepartmentsPage() {
  return (
    <CrudPage<Department>
      title="Departments"
      subtitle="Groups of staff, for example Academics or Accounts."
      endpoint="/staff/departments"
      noun="Department"
      permission="staff"
      columns={[
        { header: "Order", render: (r) => r.sortOrder },
        {
          header: "Department",
          render: (r) => <span className="font-semibold">{r.name}</span>,
        },
        {
          header: "Status",
          render: (r) => (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
            >
              {r.isActive ? "Active" : "Inactive"}
            </span>
          ),
        },
      ]}
      fields={[
        { name: "name", label: "Department name" },
        {
          name: "sortOrder",
          label: "Display order (optional)",
          type: "number",
          required: false,
        },
      ]}
      toForm={(r) => ({ name: r.name, sortOrder: String(r.sortOrder) })}
      toPayload={(v) => ({
        name: v.name,
        sortOrder: v.sortOrder ? Number(v.sortOrder) : undefined,
      })}
    />
  );
}

import { CrudPage } from "@/features/academics/CrudPage";

interface Designation {
  id: string;
  name: string;
  isTeaching: boolean;
  sortOrder: number;
  isActive: boolean;
}

export default function DesignationsPage() {
  return (
    <CrudPage<Designation>
      title="Employee Designations"
      subtitle="Job titles. Mark the ones that are teaching posts."
      endpoint="/staff/designations"
      noun="Designation"
      permission="staff"
      columns={[
        { header: "Order", render: (r) => r.sortOrder },
        {
          header: "Designation",
          render: (r) => <span className="font-semibold">{r.name}</span>,
        },
        {
          header: "Teaching post",
          render: (r) => (r.isTeaching ? "Yes" : "No"),
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
        { name: "name", label: "Designation" },
        {
          name: "isTeaching",
          label: "Is this a teaching post?",
          type: "select",
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        },
        {
          name: "sortOrder",
          label: "Display order (optional)",
          type: "number",
          required: false,
        },
      ]}
      toForm={(r) => ({
        name: r.name,
        isTeaching: r.isTeaching ? "yes" : "no",
        sortOrder: String(r.sortOrder),
      })}
      toPayload={(v) => ({
        name: v.name,
        isTeaching: v.isTeaching === "yes",
        sortOrder: v.sortOrder ? Number(v.sortOrder) : undefined,
      })}
    />
  );
}

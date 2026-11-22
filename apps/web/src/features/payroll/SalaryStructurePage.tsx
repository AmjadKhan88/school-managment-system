import { CrudPage } from "@/features/academics/CrudPage";

interface Component {
  id: string;
  name: string;
  type: "ALLOWANCE" | "DEDUCTION";
  isPercent: boolean;
  sortOrder: number;
  isActive: boolean;
}

export default function SalaryStructurePage() {
  return (
    <CrudPage<Component>
      title="Salary Structure"
      subtitle="The allowance and deduction types you use. Set each employee's values under Salary Management."
      endpoint="/payroll/components"
      noun="Component"
      permission="payroll"
      columns={[
        {
          header: "Component",
          render: (r) => <span className="font-semibold">{r.name}</span>,
        },
        {
          header: "Type",
          render: (r) => (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.type === "ALLOWANCE" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
            >
              {r.type === "ALLOWANCE" ? "Allowance" : "Deduction"}
            </span>
          ),
        },
        {
          header: "Value is",
          render: (r) => (r.isPercent ? "% of basic salary" : "Fixed amount"),
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
        { name: "name", label: "Component name" },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: [
            { value: "ALLOWANCE", label: "Allowance (added)" },
            { value: "DEDUCTION", label: "Deduction (subtracted)" },
          ],
        },
        {
          name: "isPercent",
          label: "The value is",
          type: "select",
          options: [
            { value: "no", label: "A fixed amount" },
            { value: "yes", label: "A percentage of basic salary" },
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
        type: r.type,
        isPercent: r.isPercent ? "yes" : "no",
        sortOrder: String(r.sortOrder),
      })}
      toPayload={(v) => ({
        name: v.name,
        type: v.type,
        isPercent: v.isPercent === "yes",
        sortOrder: v.sortOrder ? Number(v.sortOrder) : undefined,
      })}
    />
  );
}

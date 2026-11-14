import { CrudPage } from "@/features/academics/CrudPage";

interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default function ExpenseCategoriesPage() {
  return (
    <CrudPage<Category>
      title="Expense Categories"
      subtitle="Group your expenses for reports. A category that has expenses cannot be deleted."
      endpoint="/finance/expense-categories"
      noun="Category"
      permission="expenses"
      columns={[
        { header: "Order", render: (r) => r.sortOrder },
        {
          header: "Category",
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
        { name: "name", label: "Category name" },
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

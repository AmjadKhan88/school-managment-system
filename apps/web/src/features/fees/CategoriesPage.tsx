import { CrudPage } from "@/features/academics/CrudPage";
import { Frequency, FREQUENCY_LABEL } from "./shared";

interface Category {
  id: string;
  name: string;
  code: string;
  frequency: Frequency;
  sortOrder: number;
  isActive: boolean;
}

export default function CategoriesPage() {
  return (
    <CrudPage<Category>
      title="Fee Categories"
      subtitle="The types of fee your school charges. Prices are set per class under Fee Structure."
      endpoint="/fees/categories"
      noun="Category"
      permission="fees"
      columns={[
        { header: "Order", render: (r) => r.sortOrder },
        { header: "Code", render: (r) => r.code },
        {
          header: "Category",
          render: (r) => <span className="font-semibold">{r.name}</span>,
        },
        { header: "Charged", render: (r) => FREQUENCY_LABEL[r.frequency] },
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
        { name: "code", label: "Short code (e.g. TUI)" },
        {
          name: "frequency",
          label: "How often is it charged?",
          type: "select",
          options: [
            { value: "MONTHLY", label: "Monthly" },
            { value: "ONE_TIME", label: "One-time (charged once)" },
            { value: "YEARLY", label: "Yearly" },
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
        code: r.code,
        frequency: r.frequency,
        sortOrder: String(r.sortOrder),
      })}
      toPayload={(v) => ({
        name: v.name,
        code: v.code,
        frequency: v.frequency,
        sortOrder: v.sortOrder ? Number(v.sortOrder) : undefined,
      })}
    />
  );
}

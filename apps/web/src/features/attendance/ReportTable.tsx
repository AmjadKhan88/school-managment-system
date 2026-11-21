import { cn } from "@/lib/cn";
import { LETTER_STYLE } from "./shared";

export interface ReportCol {
  key: string;
  header: string;
  kind?: "status" | "percent";
}
export interface ReportData {
  title: string;
  columns: ReportCol[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

function Cell({
  col,
  value,
}: {
  col: ReportCol;
  value: string | number | null;
}) {
  if (value === null || value === "") return null;
  if (col.kind === "status")
    return (
      <span
        className={cn(
          "inline-block min-w-[1.4rem] rounded px-1 text-center text-xs font-bold",
          LETTER_STYLE[String(value)],
        )}
      >
        {value}
      </span>
    );
  if (col.kind === "percent") {
    const n = Number(value);
    return (
      <span
        className={cn(
          "font-semibold",
          n < 75
            ? "text-rose-600"
            : n < 90
              ? "text-amber-600"
              : "text-emerald-600",
        )}
      >
        {n}%
      </span>
    );
  }
  return <>{value}</>;
}

export function ReportTable({
  data,
  tight,
}: {
  data: ReportData;
  tight?: boolean;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            {data.columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap py-3",
                  tight && c.kind === "status" ? "px-1 text-center" : "px-3",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 && (
            <tr>
              <td
                colSpan={data.columns.length}
                className="px-4 py-10 text-center text-slate-500"
              >
                Nothing to show for these filters.
              </td>
            </tr>
          )}
          {data.rows.map((r, i) => (
            <tr
              key={i}
              className={cn(
                "border-b border-line last:border-0",
                r[data.columns[0].key] === "Total" && "bg-slate-50 font-bold",
              )}
            >
              {data.columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "whitespace-nowrap py-2",
                    tight && c.kind === "status" ? "px-1 text-center" : "px-3",
                  )}
                >
                  <Cell col={c} value={r[c.key] ?? null} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

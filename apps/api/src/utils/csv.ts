import { Response } from "express";

const escape = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote when the value contains a comma, quote or line break. Double any quotes inside.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(
  headers: string[],
  keys: string[],
  rows: Record<string, unknown>[],
) {
  const lines = [headers.map(escape).join(",")];
  rows.forEach((r) => lines.push(keys.map((k) => escape(r[k])).join(",")));
  return lines.join("\r\n");
}

/** UTF-8 with a byte-order mark so Excel shows Urdu and other non-Latin names correctly. */
export function sendCsv(
  res: Response,
  filename: string,
  headers: string[],
  keys: string[],
  rows: Record<string, unknown>[],
) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}.csv"`,
  );
  res.send("\uFEFF" + toCsv(headers, keys, rows));
}

import ExcelJS from "exceljs";
import { Response } from "express";

export interface Col {
  header: string;
  key: string;
  width?: number;
  money?: boolean;
}

/** Builds a one-sheet workbook with a styled header row, frozen header, filters and optional totals, then sends it. */
export async function sendXlsx(
  res: Response,
  filename: string,
  sheetName: string,
  columns: Col[],
  rows: Record<string, unknown>[],
  totals?: Record<string, unknown>,
) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 16,
    style: c.money ? { numFmt: "#,##0.00" } : undefined,
  }));

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { vertical: "middle" };
  head.height = 22;
  head.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B434C" },
    };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((r) => ws.addRow(r));
  if (rows.length > 0)
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

  if (totals) {
    const t = ws.addRow(totals);
    t.font = { bold: true };
    t.eachCell((cell) => {
      cell.border = { top: { style: "thin" } };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}.xlsx"`,
  );
  res.send(Buffer.from(buffer));
}

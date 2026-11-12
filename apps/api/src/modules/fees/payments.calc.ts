import { InvoiceStatus, Prisma } from "@prisma/client";

export interface OpenInvoice {
  id: string;
  balance: Prisma.Decimal;
  periodKey: string;
  dueDate: Date;
  invoiceNo: string;
}

/** Oldest month first, then earliest due date, then invoice number. */
export function sortOldestFirst<T extends OpenInvoice>(invoices: T[]): T[] {
  return [...invoices].sort(
    (a, b) =>
      a.periodKey.localeCompare(b.periodKey) ||
      a.dueDate.getTime() - b.dueDate.getTime() ||
      a.invoiceNo.localeCompare(b.invoiceNo),
  );
}

/** Spreads an amount over invoices oldest-first. Anything left over is returned as `leftover`. */
export function allocate(invoices: OpenInvoice[], amount: Prisma.Decimal) {
  let remaining = amount;
  const allocations: { invoiceId: string; amount: Prisma.Decimal }[] = [];
  for (const inv of sortOldestFirst(invoices)) {
    if (remaining.lte(0)) break;
    if (inv.balance.lte(0)) continue;
    const take = Prisma.Decimal.min(inv.balance, remaining);
    allocations.push({ invoiceId: inv.id, amount: take });
    remaining = remaining.minus(take);
  }
  return { allocations, leftover: remaining };
}

export function invoiceStatusFor(
  total: Prisma.Decimal,
  paid: Prisma.Decimal,
): InvoiceStatus {
  if (paid.lte(0)) return "OPEN";
  return paid.gte(total) ? "PAID" : "PARTIAL";
}

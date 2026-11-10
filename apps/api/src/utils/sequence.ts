import type { Prisma } from "@prisma/client";

/** Atomically increments and returns the counter for `key`. Call inside a transaction. */
export async function nextSequence(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<number> {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

export const formatNumber = (
  prefix: string,
  year: number,
  n: number,
  pad = 4,
) => `${prefix}-${year}-${String(n).padStart(pad, "0")}`;

/** Blank or whitespace-only text means "no remark". */
export const normalise = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

export const sameRemark = (
  a: string | null | undefined,
  b: string | null | undefined,
) => normalise(a) === normalise(b);

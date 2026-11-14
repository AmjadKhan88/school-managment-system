import { describe, expect, it } from "vitest";
import { fillMonths, percent } from "../modules/dashboard/dashboard.calc";

describe("fillMonths", () => {
  it("returns every month with zeros for gaps", () => {
    const r = fillMonths(
      [
        { month: "2026-09", n: 4 },
        { month: "2026-11", n: 2 },
      ],
      ["2026-09", "2026-10", "2026-11"],
    );
    expect(r).toEqual([
      { month: "2026-09", count: 4 },
      { month: "2026-10", count: 0 },
      { month: "2026-11", count: 2 },
    ]);
  });
  it("ignores months outside the list", () => {
    expect(fillMonths([{ month: "2025-01", n: 9 }], ["2026-11"])).toEqual([
      { month: "2026-11", count: 0 },
    ]);
  });
});

describe("percent", () => {
  it("rounds to one decimal", () => expect(percent(1, 3)).toBe(33.3));
  it("is 0 when there is nothing to divide by", () =>
    expect(percent(5, 0)).toBe(0));
});

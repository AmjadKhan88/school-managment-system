import { describe, expect, it } from "vitest";
import { toCsv } from "../utils/csv";
import {
  defaultersQuerySchema,
  reminderLogSchema,
} from "../modules/fees/defaulters.schema";

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    const out = toCsv(
      ["Name", "Note"],
      ["n", "note"],
      [{ n: "Khan, Ali", note: 'said "hi"\nbye' }],
    );
    expect(out).toBe('Name,Note\r\n"Khan, Ali","said ""hi""\nbye"');
  });
  it("writes empty cells for missing values", () => {
    expect(toCsv(["A", "B"], ["a", "b"], [{ a: 1, b: null }])).toBe(
      "A,B\r\n1,",
    );
  });
});

describe("defaulters query", () => {
  it("applies defaults", () => {
    const q = defaultersQuerySchema.parse({});
    expect(q.sortBy).toBe("outstanding");
    expect(q.minOutstanding).toBe(0);
    expect(q.page).toBe(1);
  });
  it("treats a blank minimum as 0 and checks the month format", () => {
    expect(
      defaultersQuerySchema.parse({ minOutstanding: "" }).minOutstanding,
    ).toBe(0);
    expect(
      defaultersQuerySchema.safeParse({ periodKey: "2026-13" }).success,
    ).toBe(false);
    expect(
      defaultersQuerySchema.safeParse({ periodKey: "2026-11" }).success,
    ).toBe(true);
  });
  it("requires a real message when logging a reminder", () => {
    expect(
      reminderLogSchema.safeParse({ studentId: "s", message: "hi" }).success,
    ).toBe(false);
    expect(
      reminderLogSchema.safeParse({
        studentId: "s",
        message: "Dear parent, fees are due.",
      }).success,
    ).toBe(true);
  });
});

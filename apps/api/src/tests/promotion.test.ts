import { describe, expect, it } from "vitest";
import { executeSchema } from "../modules/promotion/promotion.schema";

const item = {
  studentId: "s1",
  outcome: "PROMOTED",
  classId: "c2",
  sectionId: "x1",
};

describe("promotion payload", () => {
  it("accepts a valid batch", () => {
    expect(
      executeSchema.safeParse({
        fromSessionId: "a",
        toSessionId: "b",
        items: [item],
      }).success,
    ).toBe(true);
  });
  it("rejects promoting into the same session", () => {
    expect(
      executeSchema.safeParse({
        fromSessionId: "a",
        toSessionId: "a",
        items: [item],
      }).success,
    ).toBe(false);
  });
  it("rejects an empty batch", () => {
    expect(
      executeSchema.safeParse({
        fromSessionId: "a",
        toSessionId: "b",
        items: [],
      }).success,
    ).toBe(false);
  });
  it("rejects the same student twice", () => {
    expect(
      executeSchema.safeParse({
        fromSessionId: "a",
        toSessionId: "b",
        items: [item, item],
      }).success,
    ).toBe(false);
  });
  it("rejects an unknown outcome", () => {
    const bad = { ...item, outcome: "EXPELLED" };
    expect(
      executeSchema.safeParse({
        fromSessionId: "a",
        toSessionId: "b",
        items: [bad],
      }).success,
    ).toBe(false);
  });
});

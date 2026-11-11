import { describe, expect, it } from "vitest";
import {
  internalSchema,
  outSchema,
} from "../modules/transfers/transfers.schema";

describe("transfer payloads", () => {
  it("accepts an internal move and defaults the date", () => {
    const r = internalSchema.safeParse({
      studentId: "s",
      sessionId: "x",
      toClassId: "c",
      toSectionId: "sec",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.transferDate).toBeInstanceOf(Date);
  });
  it("requires a target section for an internal move", () => {
    expect(
      internalSchema.safeParse({
        studentId: "s",
        sessionId: "x",
        toClassId: "c",
      }).success,
    ).toBe(false);
  });
  it("accepts a transfer out with only the required fields", () => {
    expect(
      outSchema.safeParse({ studentId: "s", sessionId: "x" }).success,
    ).toBe(true);
  });
});

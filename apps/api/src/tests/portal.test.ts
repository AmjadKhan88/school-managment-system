import { describe, expect, it } from "vitest";
import {
  attendanceQuerySchema,
  createLoginSchema,
  kindParamSchema,
  reportCardQuerySchema,
} from "../modules/portal/portal.schema";

describe("portal payloads", () => {
  it("needs a student id on every portal query", () => {
    expect(attendanceQuerySchema.safeParse({}).success).toBe(false);
    expect(attendanceQuerySchema.safeParse({ studentId: "s" }).success).toBe(true);
    expect(reportCardQuerySchema.safeParse({ studentId: "s" }).success).toBe(false);
    expect(
      reportCardQuerySchema.safeParse({ studentId: "s", examId: "e" }).success,
    ).toBe(true);
  });
  it("accepts only a real month", () => {
    expect(
      attendanceQuerySchema.safeParse({ studentId: "s", month: "2026-11" }).success,
    ).toBe(true);
    expect(
      attendanceQuerySchema.safeParse({ studentId: "s", month: "2026-13" }).success,
    ).toBe(false);
    expect(
      attendanceQuerySchema.safeParse({ studentId: "s", month: "Nov" }).success,
    ).toBe(false);
  });
  it("lower-cases the login email and rejects bad ones", () => {
    expect(createLoginSchema.parse({ email: " Parent@Example.com " }).email).toBe(
      "parent@example.com",
    );
    expect(createLoginSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("accepts only student or guardian as a login kind", () => {
    expect(kindParamSchema.safeParse({ kind: "guardian", id: "g" }).success).toBe(true);
    expect(kindParamSchema.safeParse({ kind: "admin", id: "g" }).success).toBe(false);
  });
});

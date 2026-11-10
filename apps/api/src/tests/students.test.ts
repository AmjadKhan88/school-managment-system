import { describe, expect, it } from "vitest";
import {
  listQuerySchema,
  updateStudentSchema,
} from "../modules/students/students.schema";

describe("student schemas", () => {
  it("turns blank optional text into null so a field can be cleared", () => {
    const r = updateStudentSchema.parse({ city: "" });
    expect(r.city).toBeNull();
  });
  it("leaves omitted fields untouched", () => {
    expect(updateStudentSchema.parse({}).city).toBeUndefined();
  });
  it("rejects a future date of birth", () => {
    expect(
      updateStudentSchema.safeParse({ dateOfBirth: "2999-01-01" }).success,
    ).toBe(false);
  });
  it("applies list defaults", () => {
    const q = listQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.archived).toBe("false");
  });
});

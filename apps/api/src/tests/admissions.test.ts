import { describe, expect, it } from "vitest";
import { admissionSchema } from "../modules/admissions/admissions.schema";
import { formatNumber } from "../utils/sequence";

const valid = {
  student: {
    fullName: "Ali Khan",
    fatherName: "Gul Khan",
    dateOfBirth: "2015-03-02",
    gender: "MALE",
  },
  guardians: [
    { fullName: "Gul Khan", phone: "03001234567", relation: "FATHER" },
  ],
  placement: { sessionId: "s1", classId: "c1", sectionId: "x1" },
};

describe("admission numbers", () => {
  it("pads to 4 digits", () =>
    expect(formatNumber("ADM", 2026, 7)).toBe("ADM-2026-0007"));
});

describe("admission payload validation", () => {
  it("accepts a valid payload and applies defaults", () => {
    const r = admissionSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.student.nationality).toBe("Pakistani");
      expect(r.data.confirmDuplicate).toBe(false);
    }
  });
  it("requires at least one guardian", () => {
    expect(admissionSchema.safeParse({ ...valid, guardians: [] }).success).toBe(
      false,
    );
  });
  it("rejects a guardian without phone or id", () => {
    const bad = {
      ...valid,
      guardians: [{ fullName: "Gul", relation: "FATHER" }],
    };
    expect(admissionSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects a date of birth in the future", () => {
    const bad = {
      ...valid,
      student: { ...valid.student, dateOfBirth: "2999-01-01" },
    };
    expect(admissionSchema.safeParse(bad).success).toBe(false);
  });
});

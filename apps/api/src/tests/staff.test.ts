import { describe, expect, it } from "vitest";
import { diffFields, tempPassword } from "../modules/staff/staff.calc";
import {
  enrollmentScopeWhere,
  isScopedTeacher,
  sectionsForSubject,
  subjectSectionsInClass,
  TeacherScope,
} from "../modules/staff/scope";
import {
  accountSchema,
  classTeachersSchema,
  employeeSchema,
  statusSchema,
} from "../modules/staff/staff.schema";

describe("temporary password", () => {
  it("is 12 characters with upper, lower and digit, and differs each time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = tempPassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

describe("history diff", () => {
  it("lists only the fields that changed", () => {
    expect(
      diffFields(
        { Designation: "Teacher", Department: "Academics" },
        { Designation: "Senior Teacher", Department: "Academics" },
      ),
    ).toEqual([
      { field: "Designation", oldValue: "Teacher", newValue: "Senior Teacher" },
    ]);
  });
  it("treats missing and null the same", () =>
    expect(diffFields({}, { Department: null })).toEqual([]));
});

describe("teacher scope", () => {
  it("limits only users whose roles are all teacher roles", () => {
    expect(isScopedTeacher({ roles: ["teacher"] })).toBe(true);
    expect(isScopedTeacher({ roles: ["teacher", "class-teacher"] })).toBe(true);
    expect(isScopedTeacher({ roles: ["teacher", "accountant"] })).toBe(false);
    expect(isScopedTeacher({ roles: ["school-admin"] })).toBe(false);
    expect(isScopedTeacher({ roles: [] })).toBe(false);
  });
  const scope: TeacherScope = {
    classTeacher: [{ classId: "c5", sectionId: "a" }],
    teaching: [
      { classId: "c5", sectionId: "a", subjectId: "math" },
      { classId: "c5", sectionId: "b", subjectId: "math" },
      { classId: "c6", sectionId: "x", subjectId: "eng" },
    ],
  };
  it("finds the sections a subject is taught in", () => {
    expect([...sectionsForSubject(scope, "c5", "math")].sort()).toEqual([
      "a",
      "b",
    ]);
    expect(sectionsForSubject(scope, "c5", "eng").size).toBe(0);
  });
  it("groups subjects by section for one class", () => {
    const m = subjectSectionsInClass(scope, "c5");
    expect([...m.keys()]).toEqual(["math"]);
  });
  it("matches no students when there are no assignments", () => {
    expect(enrollmentScopeWhere({ classTeacher: [], teaching: [] })).toEqual({
      id: "__none__",
    });
    expect((enrollmentScopeWhere(scope) as { OR: unknown[] }).OR).toHaveLength(
      4,
    );
  });
});

describe("payloads", () => {
  const emp = {
    fullName: "Ayesha Khan",
    gender: "FEMALE",
    phone: "03001234567",
    designationId: "d",
    joiningDate: "2024-04-01",
  };
  it("accepts a minimal employee and defaults", () => {
    const r = employeeSchema.safeParse(emp);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.employmentType).toBe("PERMANENT");
      expect(r.data.isTeacher).toBe(false);
    }
  });
  it("normalises the CNIC and rejects a bad one", () => {
    const ok = employeeSchema.safeParse({ ...emp, cnic: "17301-1234567-1" });
    expect(ok.success && ok.data.cnic).toBe("1730112345671");
    expect(employeeSchema.safeParse({ ...emp, cnic: "123" }).success).toBe(
      false,
    );
    const blank = employeeSchema.safeParse({ ...emp, cnic: "" });
    expect(blank.success && blank.data.cnic).toBeNull();
  });
  it("rejects a future joining date and a bad email", () => {
    expect(
      employeeSchema.safeParse({ ...emp, joiningDate: "2999-01-01" }).success,
    ).toBe(false);
    expect(employeeSchema.safeParse({ ...emp, email: "nope" }).success).toBe(
      false,
    );
  });
  it("only allows non-admin roles for accounts", () => {
    expect(
      accountSchema.safeParse({ email: "T@School.com", roleSlug: "teacher" })
        .success,
    ).toBe(true);
    expect(
      accountSchema.safeParse({ email: "a@b.com", roleSlug: "school-admin" })
        .success,
    ).toBe(false);
  });
  it("validates status changes and assignment cells", () => {
    expect(statusSchema.safeParse({ status: "RESIGNED" }).success).toBe(true);
    expect(statusSchema.safeParse({ status: "FIRED" }).success).toBe(false);
    expect(
      classTeachersSchema.safeParse({
        sessionId: "s",
        classId: "c",
        cells: [{ sectionId: "a", employeeId: null }],
      }).success,
    ).toBe(true);
    expect(
      classTeachersSchema.safeParse({ sessionId: "s", classId: "c", cells: [] })
        .success,
    ).toBe(false);
  });
});

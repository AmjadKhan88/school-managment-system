import { describe, expect, it } from "vitest";
import {
  extractVars,
  isEmail,
  joinNames,
  render,
  toDigits,
} from "../modules/communication/messages.calc";
import { composeSchema } from "../modules/communication/messages.schema";

describe("phone numbers", () => {
  it("turns Pakistani formats into international digits", () => {
    expect(toDigits("0300 1234567")).toBe("923001234567");
    expect(toDigits("+92 300-1234567")).toBe("923001234567");
    expect(toDigits("0092 300 1234567")).toBe("923001234567");
    expect(toDigits("3001234567")).toBe("923001234567");
  });
  it("rejects numbers that cannot be real", () => {
    expect(toDigits("12345")).toBeNull();
    expect(toDigits("")).toBeNull();
    expect(toDigits(null)).toBeNull();
  });
});

describe("templates", () => {
  it("fills known variables and leaves unknown ones as typed", () => {
    expect(
      render("Dear {parent_name}, {student_name} owes {amount} {oops}", {
        parent_name: "Ali",
        student_name: "Sara",
        amount: "Rs 5,000",
      }),
    ).toBe("Dear Ali, Sara owes Rs 5,000 {oops}");
  });
  it("lists variables in order of appearance", () => {
    expect(extractVars("{a} then {b} then {a}")).toEqual(["a", "b", "a"]);
  });
  it("joins sibling names naturally", () => {
    expect(joinNames(["Sara"])).toBe("Sara");
    expect(joinNames(["Sara", "Omar"])).toBe("Sara and Omar");
    expect(joinNames(["Sara", "Omar", "Zain"])).toBe("Sara, Omar and Zain");
  });
  it("recognises email addresses", () => {
    expect(isEmail("a@b.com")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
});

describe("compose payload", () => {
  const base = {
    channel: "WHATSAPP",
    body: "Hello {parent_name}",
    audience: { type: "PARENTS_ALL" },
  };
  it("accepts a simple send", () =>
    expect(composeSchema.safeParse(base).success).toBe(true));
  it("needs a subject for email", () => {
    expect(composeSchema.safeParse({ ...base, channel: "EMAIL" }).success).toBe(
      false,
    );
    expect(
      composeSchema.safeParse({ ...base, channel: "EMAIL", subject: "Notice" })
        .success,
    ).toBe(true);
  });
  it("needs a class for class audiences and defaults defaulter filters", () => {
    expect(
      composeSchema.safeParse({ ...base, audience: { type: "PARENTS_CLASS" } })
        .success,
    ).toBe(false);
    const r = composeSchema.parse({
      ...base,
      audience: { type: "DEFAULTERS" },
    });
    expect(r.audience.type === "DEFAULTERS" && r.audience.minOutstanding).toBe(
      0,
    );
  });
  it("rejects an unknown channel and a too-short message", () => {
    expect(
      composeSchema.safeParse({ ...base, channel: "PIGEON" }).success,
    ).toBe(false);
    expect(composeSchema.safeParse({ ...base, body: "Hi" }).success).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  addDays,
  expiryState,
  monthBounds,
  overlapsMonth,
  pickBilled,
  seatsFree,
} from "../modules/transport/transport.calc";
import {
  assignSchema,
  attendanceSaveSchema,
  endSchema,
  routeSchema,
  stopSchema,
  vehicleSchema,
} from "../modules/transport/transport.schema";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("months and stays", () => {
  it("knows the first and last day of a month", () => {
    const b = monthBounds("2026-02");
    expect(b.start.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(b.end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
  it("bills a month the stay touches, including the month it started and ended", () => {
    expect(
      overlapsMonth({ startDate: d("2026-11-20"), endDate: null }, "2026-11"),
    ).toBe(true);
    expect(
      overlapsMonth({ startDate: d("2026-11-20"), endDate: null }, "2026-10"),
    ).toBe(false);
    expect(
      overlapsMonth(
        { startDate: d("2026-09-01"), endDate: d("2026-11-03") },
        "2026-11",
      ),
    ).toBe(true);
    expect(
      overlapsMonth(
        { startDate: d("2026-09-01"), endDate: d("2026-10-31") },
        "2026-11",
      ),
    ).toBe(false);
  });
  it("bills the newer stay when a student changed route in the month", () => {
    const a = { id: "old", startDate: d("2026-11-01") };
    const b = { id: "new", startDate: d("2026-11-15") };
    expect(pickBilled([a, b])?.id).toBe("new");
    expect(pickBilled([])).toBeNull();
  });
  it("moves dates by whole days", () =>
    expect(addDays(d("2026-12-01"), -1).toISOString().slice(0, 10)).toBe(
      "2026-11-30",
    ));
});

describe("expiry and seats", () => {
  const today = d("2026-11-28");
  it("classifies a date", () => {
    expect(expiryState(d("2026-11-01"), today)).toBe("EXPIRED");
    expect(expiryState(d("2026-12-20"), today)).toBe("SOON");
    expect(expiryState(d("2027-06-01"), today)).toBe("OK");
    expect(expiryState(null, today)).toBeNull();
  });
  it("never reports negative seats", () => {
    expect(seatsFree(30, 12)).toBe(18);
    expect(seatsFree(30, 35)).toBe(0);
  });
});

describe("payloads", () => {
  it("upper-cases a vehicle number and clears empty optional boxes", () => {
    const v = vehicleSchema.parse({
      vehicleNo: " lea-1234 ",
      capacity: "32",
      year: "",
      registrationExpiry: "",
      notes: "",
    });
    expect(v.vehicleNo).toBe("LEA-1234");
    expect(v.capacity).toBe(32);
    expect(v.year).toBeNull();
    expect(v.registrationExpiry).toBeNull();
    expect(v.status).toBe("ACTIVE");
    expect(
      vehicleSchema.safeParse({ vehicleNo: "AB", capacity: 30 }).success,
    ).toBe(false);
    expect(
      vehicleSchema.safeParse({ vehicleNo: "LEA-1", capacity: 0 }).success,
    ).toBe(false);
  });
  it("checks route times and stop fees", () => {
    expect(
      routeSchema.safeParse({ name: "North", morningTime: "07:15" }).success,
    ).toBe(true);
    expect(
      routeSchema.safeParse({ name: "North", morningTime: "7.15" }).success,
    ).toBe(false);
    expect(
      stopSchema.safeParse({
        routeId: "r",
        name: "Hayatabad",
        monthlyFee: 2500,
      }).success,
    ).toBe(true);
    expect(
      stopSchema.safeParse({ routeId: "r", name: "Hayatabad", monthlyFee: -1 })
        .success,
    ).toBe(false);
  });
  it("lets the fee default to the stop fee and needs a reason to end", () => {
    expect(
      assignSchema.parse({ studentId: "s", stopId: "p", monthlyFee: "" })
        .monthlyFee,
    ).toBeUndefined();
    expect(
      assignSchema.parse({ studentId: "s", stopId: "p", monthlyFee: "1800" })
        .monthlyFee,
    ).toBe(1800);
    expect(endSchema.safeParse({ reason: "x" }).success).toBe(false);
    expect(endSchema.safeParse({ reason: "Family moved away" }).success).toBe(
      true,
    );
  });
  it("needs at least one boarding record", () => {
    const base = { routeId: "r", date: "2026-11-20", trip: "MORNING" };
    expect(
      attendanceSaveSchema.safeParse({ ...base, records: [] }).success,
    ).toBe(false);
    expect(
      attendanceSaveSchema.safeParse({
        ...base,
        records: [{ studentId: "s", status: "BOARDED" }],
      }).success,
    ).toBe(true);
    expect(
      attendanceSaveSchema.safeParse({
        ...base,
        records: [{ studentId: "s", status: "LATE" }],
      }).success,
    ).toBe(false);
  });
});

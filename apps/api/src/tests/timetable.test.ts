import { describe, expect, it } from "vitest";
import {
  configSchema,
  entrySchema,
  periodSchema,
} from "../modules/timetable/timetable.schema";
import {
  datesBetween,
  dateOfDay,
  leaveOn,
  mondayOf,
  slotConflicts,
  validatePeriod,
  weekdayOf,
} from "../modules/timetable/timetable.calc";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("weekdays and weeks", () => {
  it("numbers Monday as 1 and Sunday as 7", () => {
    expect(weekdayOf(d("2026-11-23"))).toBe(1); // a Monday
    expect(weekdayOf(d("2026-11-28"))).toBe(6);
    expect(weekdayOf(d("2026-11-29"))).toBe(7);
  });
  it("finds the Monday of any day in the week and the date of a weekday", () => {
    expect(mondayOf(d("2026-11-26")).toISOString().slice(0, 10)).toBe(
      "2026-11-23",
    );
    expect(mondayOf(d("2026-11-29")).toISOString().slice(0, 10)).toBe(
      "2026-11-23",
    );
    expect(dateOfDay(d("2026-11-23"), 3).toISOString().slice(0, 10)).toBe(
      "2026-11-25",
    );
  });
  it("lists every date in a range, both ends included", () => {
    expect(datesBetween("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });
});

describe("period validation", () => {
  const others = [
    { id: "a", startTime: "08:00", endTime: "08:40" },
    { id: "b", startTime: "08:40", endTime: "09:20" },
  ];
  it("accepts a period that touches but does not overlap", () =>
    expect(
      validatePeriod({ startTime: "09:20", endTime: "10:00" }, others),
    ).toBeNull());
  it("refuses an overlap, a reversed range and a bad format", () => {
    expect(
      validatePeriod({ startTime: "08:30", endTime: "09:00" }, others),
    ).toMatch(/overlaps/);
    expect(
      validatePeriod({ startTime: "10:00", endTime: "09:00" }, others),
    ).toMatch(/after the start/);
    expect(
      validatePeriod({ startTime: "8am", endTime: "9am" }, others),
    ).toMatch(/HH:MM/);
  });
  it("ignores itself when editing", () =>
    expect(
      validatePeriod({ id: "a", startTime: "07:50", endTime: "08:40" }, others),
    ).toBeNull());
});

describe("slot conflicts", () => {
  const mine = { sectionId: "s1", employeeId: "t1", roomId: "r1" };
  const other = (
    over: Partial<{
      sectionId: string;
      employeeId: string | null;
      roomId: string | null;
    }>,
  ) => ({
    sectionId: "s2",
    employeeId: "t9",
    roomId: "r9",
    label: "Class 6 B (Maths)",
    ...over,
  });
  it("flags the same teacher or the same room in another section", () => {
    expect(
      slotConflicts(mine, [other({ employeeId: "t1" })], {
        teacher: "Ayesha Khan",
      }).join(),
    ).toMatch(/Ayesha Khan is already teaching Class 6 B/);
    expect(
      slotConflicts(mine, [other({ roomId: "r1" })], { room: "Room 5" }).join(),
    ).toMatch(/Room 5 is already used/);
  });
  it("flags both when both clash", () =>
    expect(
      slotConflicts(mine, [other({ employeeId: "t1", roomId: "r1" })], {}),
    ).toHaveLength(2));
  it("ignores the section's own slot and entries with no teacher or room", () => {
    expect(
      slotConflicts(mine, [other({ sectionId: "s1", employeeId: "t1" })], {}),
    ).toEqual([]);
    expect(
      slotConflicts(
        { sectionId: "s1", employeeId: null, roomId: null },
        [other({ employeeId: null, roomId: null })],
        {},
      ),
    ).toEqual([]);
  });
});

describe("approved leave on a date", () => {
  const spans = [
    {
      employeeId: "t1",
      start: "2026-11-24",
      end: "2026-11-26",
      applicationNo: "SLV-2026-00001",
      type: "SICK",
    },
  ];
  it("covers every day of the leave, both ends included", () => {
    expect(leaveOn(spans, "t1", "2026-11-24")?.applicationNo).toBe(
      "SLV-2026-00001",
    );
    expect(leaveOn(spans, "t1", "2026-11-26")).not.toBeNull();
  });
  it("does not cover other days or other people", () => {
    expect(leaveOn(spans, "t1", "2026-11-27")).toBeNull();
    expect(leaveOn(spans, "t2", "2026-11-25")).toBeNull();
  });
});

describe("payloads", () => {
  it("accepts a period and rejects a bad time", () => {
    expect(
      periodSchema.safeParse({
        sessionId: "s",
        name: "Period 1",
        startTime: "08:00",
        endTime: "08:40",
      }).success,
    ).toBe(true);
    expect(
      periodSchema.safeParse({
        sessionId: "s",
        name: "P",
        startTime: "8:00",
        endTime: "08:40",
      }).success,
    ).toBe(false);
  });
  it("needs at least one working day and no duplicates", () => {
    expect(
      configSchema.safeParse({ sessionId: "s", workingDays: [1, 2, 3] })
        .success,
    ).toBe(true);
    expect(
      configSchema.safeParse({ sessionId: "s", workingDays: [] }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ sessionId: "s", workingDays: [1, 1] }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ sessionId: "s", workingDays: [8] }).success,
    ).toBe(false);
  });
  it("turns blank teacher and room into none", () => {
    const r = entrySchema.parse({
      sessionId: "s",
      sectionId: "a",
      dayOfWeek: "2",
      periodId: "p",
      subjectId: "x",
      employeeId: "",
      roomId: null,
    });
    expect(r.dayOfWeek).toBe(2);
    expect(r.employeeId).toBeNull();
    expect(r.roomId).toBeNull();
  });
});

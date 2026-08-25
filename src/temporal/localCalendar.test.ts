import { describe, expect, test } from "bun:test";
import {
  addLocalCalendarDays,
  compareLocalDates,
  formatLocalTimeLabel,
  formatTaskSchedule,
  getLocalDateString,
  getLocalTimeString,
  getZonedDateTimeStrings,
  isLocalDateAfter,
  isLocalDateBefore,
} from "./localCalendar";

describe("getLocalDateString", () => {
  test("formats local calendar date as YYYY-MM-DD", () => {
    // Explicit local components — not UTC
    const d = new Date(2026, 0, 5, 23, 30, 0); // Jan 5 2026 local evening
    expect(getLocalDateString(d)).toBe("2026-01-05");
  });

  test("does not use UTC date near local midnight", () => {
    // Local Jan 1 00:30 — in western timezones UTC may still be Dec 31
    const d = new Date(2026, 0, 1, 0, 30, 0);
    expect(getLocalDateString(d)).toBe("2026-01-01");
    // Contrast: UTC slice would be wrong for negative offsets late evening
    // (assertion documents local semantics only)
    expect(getLocalDateString(d)).not.toMatch(/T/);
  });

  test("pads month and day", () => {
    const d = new Date(2026, 8, 7, 12, 0, 0); // Sep 7
    expect(getLocalDateString(d)).toBe("2026-09-07");
  });
});

describe("getLocalTimeString", () => {
  test("formats HH:mm", () => {
    const d = new Date(2026, 0, 1, 9, 5, 0);
    expect(getLocalTimeString(d)).toBe("09:05");
  });
});

describe("schedule display helpers", () => {
  test("uses relative labels for near-term local dates", () => {
    const now = new Date(2026, 0, 5, 12, 0, 0);
    expect(formatTaskSchedule("2026-01-05", "09:05", now)).toContain("Today");
    expect(formatTaskSchedule("2026-01-06", null, now)).toBe("Tomorrow");
  });

  test("formats stored time with the device time convention", () => {
    expect(formatLocalTimeLabel("09:05")).toContain("9:05");
  });
});

describe("zoned calendar helpers", () => {
  test("formats fixed timezone values from an instant", () => {
    const instant = new Date("2026-08-10T03:55:00.000Z");
    expect(getZonedDateTimeStrings(instant, "America/New_York")).toEqual({
      date: "2026-08-09",
      time: "23:55",
    });
  });

  test("adds calendar days across month boundaries", () => {
    expect(addLocalCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("compareLocalDates", () => {
  test("orders ISO local dates", () => {
    expect(compareLocalDates("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareLocalDates("2026-01-02", "2026-01-01")).toBe(1);
    expect(compareLocalDates("2026-01-01", "2026-01-01")).toBe(0);
    expect(isLocalDateBefore("2026-01-01", "2026-01-02")).toBe(true);
    expect(isLocalDateAfter("2026-01-02", "2026-01-01")).toBe(true);
  });
});

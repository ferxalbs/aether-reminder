import { describe, expect, test } from "bun:test";
import {
  assertResolvedDateTime,
  resolveExplicitDate,
  resolveExplicitTime,
  resolveNextWeekday,
  resolveToday,
  resolveTomorrow,
  TemporalValidationError,
} from "./index";

describe("temporal resolve", () => {
  const fixed = new Date(2026, 7, 7, 15, 30, 0); // Fri Aug 7 2026 local

  test("today / tomorrow", () => {
    expect(resolveToday(fixed).date).toBe("2026-08-07");
    expect(resolveTomorrow(fixed).date).toBe("2026-08-08");
    expect(resolveToday(fixed).semantics).toBe("floating");
  });

  test("explicit YYYY-MM-DD + time", () => {
    const r = resolveExplicitDate("2026-12-25", { time: "09:15" });
    expect(r.date).toBe("2026-12-25");
    expect(r.time).toBe("09:15");
  });

  test("explicit local time on given date", () => {
    const r = resolveExplicitTime("18:00", { date: "2026-08-07" });
    expect(r.date).toBe("2026-08-07");
    expect(r.time).toBe("18:00");
  });

  test("next weekday skips today when matching", () => {
    // fixed is Friday → next friday is +7
    const nextFri = resolveNextWeekday("friday", fixed);
    expect(nextFri.date).toBe("2026-08-14");
    const nextMon = resolveNextWeekday("monday", fixed);
    expect(nextMon.date).toBe("2026-08-10");
  });

  test("rejects ISO instants as local dates", () => {
    expect(() =>
      assertResolvedDateTime({ date: "2026-08-07T12:00:00.000Z" }),
    ).toThrow(TemporalValidationError);
  });

  test("rejects invalid dates", () => {
    expect(() => resolveExplicitDate("2026-13-40")).toThrow(
      TemporalValidationError,
    );
    expect(() => resolveExplicitTime("25:99")).toThrow(TemporalValidationError);
  });
});

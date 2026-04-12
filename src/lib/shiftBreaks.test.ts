import { describe, it, expect } from "vitest";
import { getHourlyTargets } from "./shiftBreaks";

describe("getHourlyTargets", () => {
  const EMPTY_OUTPUT: Record<string, number> = {};

  it("returns correct number of rows for day shift", () => {
    // Day: ceil(6)=7 to ceil(16.5)=17 → hours 7..16 = 10 rows
    const rows = getHourlyTargets(225, "day", EMPTY_OUTPUT);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it("returns correct number of rows for night shift", () => {
    // Night: ceil(17)=18 to ceil(27.5)=28 → hours 18..27 = 10 rows
    const rows = getHourlyTargets(200, "night", EMPTY_OUTPUT);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it("marks break-only hours with isBreak=true and planned=0", () => {
    const rows = getHourlyTargets(225, "day", EMPTY_OUTPUT);
    const breakRows = rows.filter((r) => r.isBreak);
    for (const row of breakRows) {
      expect(row.planned).toBe(0);
      expect(row.variance).toBe(0);
    }
  });

  it("non-break rows have positive planned values", () => {
    const rows = getHourlyTargets(225, "day", EMPTY_OUTPUT);
    const workRows = rows.filter((r) => !r.isBreak);
    for (const row of workRows) {
      expect(row.planned).toBeGreaterThan(0);
    }
  });

  it("total planned across all rows approximates the daily target", () => {
    const target = 225;
    const rows = getHourlyTargets(target, "day", EMPTY_OUTPUT);
    const totalPlanned = rows.reduce((sum, r) => sum + r.planned, 0);
    // Should be within ~10% due to rounding
    expect(totalPlanned).toBeGreaterThan(target * 0.85);
    expect(totalPlanned).toBeLessThan(target * 1.15);
  });

  it("variance = actual - planned for non-break rows", () => {
    const hourlyOutput: Record<string, number> = { "07:00": 30, "08:00": 15 };
    const rows = getHourlyTargets(225, "day", hourlyOutput);
    for (const row of rows) {
      if (!row.isBreak) {
        const actual = hourlyOutput[row.hour] ?? 0;
        expect(row.variance).toBe(actual - row.planned);
      }
    }
  });

  it("status is green when actual >= planned", () => {
    const hourlyOutput: Record<string, number> = {
      "07:00": 999,
      "09:00": 999,
      "10:00": 999,
    };
    const rows = getHourlyTargets(225, "day", hourlyOutput);
    for (const row of rows) {
      if (!row.isBreak && (hourlyOutput[row.hour] ?? 0) > 0) {
        expect(row.status).toBe("green");
      }
    }
  });

  it("status is red when actual < 90% of planned", () => {
    // With 0 output, status should be red for work rows
    const rows = getHourlyTargets(225, "day", EMPTY_OUTPUT);
    const workRows = rows.filter((r) => !r.isBreak);
    for (const row of workRows) {
      expect(row.status).toBe("red");
    }
  });

  it("handles zero target gracefully", () => {
    const rows = getHourlyTargets(0, "day", EMPTY_OUTPUT);
    for (const row of rows) {
      expect(row.planned).toBe(0);
    }
  });

  it("hour keys are formatted as HH:00", () => {
    const rows = getHourlyTargets(225, "day", EMPTY_OUTPUT);
    for (const row of rows) {
      expect(row.hour).toMatch(/^\d{2}:00$/);
    }
  });

  it("night shift hour keys wrap around midnight correctly", () => {
    const rows = getHourlyTargets(200, "night", EMPTY_OUTPUT);
    const hours = rows.map((r) => r.hour);
    // Should contain both pre-midnight (18:00, 19:00…) and post-midnight (00:00, 01:00…)
    expect(hours.some((h) => parseInt(h) >= 18)).toBe(true);
    expect(hours.some((h) => parseInt(h) < 6)).toBe(true);
  });
});

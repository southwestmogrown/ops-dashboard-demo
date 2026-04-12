import { describe, it, expect } from "vitest";
import {
  getShiftWindows,
  getShiftProgress,
  formatShiftTime,
} from "./shiftTime";

describe("getShiftWindows", () => {
  it("day shift starts at hour 6", () => {
    const win = getShiftWindows("day");
    expect(win.startHour).toBe(6);
  });

  it("day shift ends at 16.5 (16:30)", () => {
    const win = getShiftWindows("day");
    expect(win.endHour).toBe(16.5);
  });

  it("night shift starts at hour 17", () => {
    const win = getShiftWindows("night");
    expect(win.startHour).toBe(17);
  });

  it("night shift ends at 27.5 (03:30 next day)", () => {
    const win = getShiftWindows("night");
    expect(win.endHour).toBe(27.5);
  });

  it("day shift total clock minutes is 630", () => {
    const win = getShiftWindows("day");
    expect(win.totalClockMinutes).toBe(630);
  });

  it("night shift total clock minutes is 630", () => {
    const win = getShiftWindows("night");
    expect(win.totalClockMinutes).toBe(630);
  });

  it("day shift has 4 break windows", () => {
    const win = getShiftWindows("day");
    expect(win.breakWindows).toHaveLength(4);
  });

  it("night shift has 4 break windows", () => {
    const win = getShiftWindows("night");
    expect(win.breakWindows).toHaveLength(4);
  });

  it("day shift work minutes = clock minutes minus break minutes", () => {
    const win = getShiftWindows("day");
    const breakMins = win.breakWindows.reduce(
      (sum, b) => sum + (b.end - b.start) * 60,
      0
    );
    expect(win.totalWorkMinutes).toBe(win.totalClockMinutes - breakMins);
  });

  it("night shift work minutes = clock minutes minus break minutes", () => {
    const win = getShiftWindows("night");
    const breakMins = win.breakWindows.reduce(
      (sum, b) => sum + (b.end - b.start) * 60,
      0
    );
    expect(win.totalWorkMinutes).toBe(win.totalClockMinutes - breakMins);
  });
});

describe("getShiftProgress", () => {
  it("returns ~0% elapsed at shift start (day)", () => {
    const now = new Date("2026-04-12T06:00:00Z");
    const progress = getShiftProgress("day", now, { useUtc: true });
    expect(progress.elapsedHours).toBeCloseTo(0, 1);
    expect(progress.elapsedFraction).toBeCloseTo(0, 2);
  });

  it("returns ~50% elapsed at midpoint (day shift)", () => {
    // Day: 06:00 to 16:30 = 10.5h total. Midpoint = 06:00 + 5.25h = 11:15
    const now = new Date("2026-04-12T11:15:00Z");
    const progress = getShiftProgress("day", now, { useUtc: true });
    expect(progress.elapsedFraction).toBeCloseTo(0.5, 1);
  });

  it("returns 100% elapsed at shift end (day)", () => {
    const now = new Date("2026-04-12T16:30:00Z");
    const progress = getShiftProgress("day", now, { useUtc: true });
    expect(progress.elapsedFraction).toBeCloseTo(1, 1);
  });

  it("clamps elapsed to [0, totalHours]", () => {
    // Well past shift end
    const now = new Date("2026-04-12T20:00:00Z");
    const progress = getShiftProgress("day", now, { useUtc: true });
    const totalHours = getShiftWindows("day").totalClockMinutes / 60;
    expect(progress.elapsedHours).toBeLessThanOrEqual(totalHours);
  });

  it("handles night shift midnight crossing", () => {
    // Night shift: 17:00 to 03:30 next day. At 01:00 (8h in) out of 10.5h total
    const now = new Date("2026-04-13T01:00:00Z");
    const progress = getShiftProgress("night", now, { useUtc: true });
    expect(progress.elapsedHours).toBeCloseTo(8, 0);
  });

  it("totalHours equals totalClockMinutes / 60", () => {
    const now = new Date("2026-04-12T12:00:00Z");
    const progress = getShiftProgress("day", now, { useUtc: true });
    const win = getShiftWindows("day");
    expect(progress.totalHours).toBe(win.totalClockMinutes / 60);
  });

  it("remainingHours = totalHours - elapsedHours", () => {
    const now = new Date("2026-04-12T10:00:00Z");
    const progress = getShiftProgress("day", now, { useUtc: true });
    expect(progress.remainingHours).toBeCloseTo(
      progress.totalHours - progress.elapsedHours,
      5
    );
  });
});

describe("formatShiftTime", () => {
  it("formats 0 hours as '0m'", () => {
    expect(formatShiftTime(0)).toBe("0m");
  });

  it("formats whole hours without minutes", () => {
    expect(formatShiftTime(3)).toBe("3h");
  });

  it("formats fractional hours with minutes", () => {
    expect(formatShiftTime(2.5)).toBe("2h 30m");
  });

  it("formats sub-hour values as minutes only", () => {
    expect(formatShiftTime(0.75)).toBe("45m");
  });

  it("formats 10.5 hours correctly", () => {
    expect(formatShiftTime(10.5)).toBe("10h 30m");
  });
});

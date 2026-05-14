import { describe, expect, it } from "vitest";
import { buildHpuTrend } from "./hpuTrend";

describe("buildHpuTrend", () => {
  it("builds cumulative day-shift HPU points through the active hour", () => {
    const trend = buildHpuTrend(
      { "06:00": 20, "07:00": 30, "08:00": 10 },
      "day",
      45,
      2.5,
    );

    expect(trend.slice(0, 4)).toEqual([
      { time: "06:00", hpu: 2.25, cumulativeOutput: 20, elapsedHours: 1 },
      { time: "07:00", hpu: 1.8, cumulativeOutput: 50, elapsedHours: 2 },
      { time: "08:00", hpu: 1.88, cumulativeOutput: 60, elapsedHours: 2.5 },
      { time: "09:00", hpu: null, cumulativeOutput: 60, elapsedHours: 0 },
    ]);
  });

  it("wraps night-shift labels across midnight", () => {
    const trend = buildHpuTrend(
      { "17:00": 10, "23:00": 15, "00:00": 20 },
      "night",
      40,
      8.25,
    );

    expect(trend.map((point) => point.time)).toContain("00:00");
    expect(trend.map((point) => point.time)).toContain("01:00");
    expect(trend.find((point) => point.time === "00:00")).toEqual({
      time: "00:00",
      hpu: 7.11,
      cumulativeOutput: 45,
      elapsedHours: 8,
    });
    expect(trend.find((point) => point.time === "01:00")).toEqual({
      time: "01:00",
      hpu: 7.33,
      cumulativeOutput: 45,
      elapsedHours: 8.25,
    });
  });

  it("keeps HPU null until the line has produced output", () => {
    const trend = buildHpuTrend({ "06:00": 0, "07:00": 12 }, "day", 45, 2);

    expect(trend[0]).toEqual({
      time: "06:00",
      hpu: null,
      cumulativeOutput: 0,
      elapsedHours: 1,
    });
    expect(trend[1]).toEqual({
      time: "07:00",
      hpu: 7.5,
      cumulativeOutput: 12,
      elapsedHours: 2,
    });
  });
});

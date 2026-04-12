import { describe, it, expect } from "vitest";
import {
  generateMetrics,
  getDefaultHeadcount,
  getDefaultTarget,
  LINE_DEFS,
} from "./generateMetrics";

describe("LINE_DEFS", () => {
  it("contains 6 lines", () => {
    expect(LINE_DEFS).toHaveLength(6);
  });

  it("has 4 VS1 lines and 2 VS2 lines", () => {
    const vs1 = LINE_DEFS.filter((l) => l.valueStream === "VS1");
    const vs2 = LINE_DEFS.filter((l) => l.valueStream === "VS2");
    expect(vs1).toHaveLength(4);
    expect(vs2).toHaveLength(2);
  });

  it("all ids are unique", () => {
    const ids = LINE_DEFS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("generateMetrics", () => {
  it("returns 6 lines for day shift", () => {
    const m = generateMetrics("day");
    expect(m.lines).toHaveLength(6);
    expect(m.shift).toBe("day");
  });

  it("returns 6 lines for night shift", () => {
    const m = generateMetrics("night");
    expect(m.lines).toHaveLength(6);
    expect(m.shift).toBe("night");
  });

  it("is deterministic — same shift produces identical line data", () => {
    const a = generateMetrics("day");
    const b = generateMetrics("day");
    // generatedAt will differ, so compare lines + trend only
    expect(a.lines).toEqual(b.lines);
    expect(a.trend).toEqual(b.trend);
  });

  it("day and night produce different values (different seeds)", () => {
    const day = generateMetrics("day");
    const night = generateMetrics("night");
    // Outputs are extremely unlikely to match across different seeds
    expect(day.lines[0]!.output).not.toBe(night.lines[0]!.output);
  });

  it("overrideSeed takes priority over shift default", () => {
    const a = generateMetrics("day", 9999);
    const b = generateMetrics("night", 9999);
    // Same seed → identical line data (RNG-driven)
    expect(a.lines).toEqual(b.lines);
    // Trend values match but time labels differ (shift-dependent start hour)
    expect(a.trend.map((t) => t.vs1Output)).toEqual(
      b.trend.map((t) => t.vs1Output)
    );
    expect(a.trend.map((t) => t.vs2Output)).toEqual(
      b.trend.map((t) => t.vs2Output)
    );
  });

  it("trend has 16 half-hour data points", () => {
    const m = generateMetrics("day");
    expect(m.trend).toHaveLength(16);
  });

  it("trend values are cumulative (monotonically increasing)", () => {
    const m = generateMetrics("day");
    for (let i = 1; i < m.trend.length; i++) {
      expect(m.trend[i]!.vs1Output).toBeGreaterThanOrEqual(
        m.trend[i - 1]!.vs1Output
      );
      expect(m.trend[i]!.vs2Output).toBeGreaterThanOrEqual(
        m.trend[i - 1]!.vs2Output
      );
    }
  });

  it("all line outputs are non-negative integers", () => {
    const m = generateMetrics("day");
    for (const line of m.lines) {
      expect(line.output).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(line.output)).toBe(true);
    }
  });

  it("all line targets are positive integers", () => {
    const m = generateMetrics("day");
    for (const line of m.lines) {
      expect(line.target).toBeGreaterThan(0);
      expect(Number.isInteger(line.target)).toBe(true);
    }
  });

  it("generatedAt is a valid ISO timestamp", () => {
    const m = generateMetrics("day");
    expect(new Date(m.generatedAt).toISOString()).toBe(m.generatedAt);
  });
});

describe("getDefaultTarget", () => {
  it("returns 225 for VS1 lines", () => {
    expect(getDefaultTarget("vs1-l1")).toBe(225);
    expect(getDefaultTarget("vs1-l2")).toBe(225);
    expect(getDefaultTarget("vs1-l3")).toBe(225);
    expect(getDefaultTarget("vs1-l4")).toBe(225);
  });

  it("returns 200 for VS2 lines", () => {
    expect(getDefaultTarget("vs2-l1")).toBe(200);
    expect(getDefaultTarget("vs2-l2")).toBe(200);
  });
});

describe("getDefaultHeadcount", () => {
  it("returns 45 for VS1 lines", () => {
    expect(getDefaultHeadcount("vs1-l1")).toBe(45);
    expect(getDefaultHeadcount("vs1-l2")).toBe(45);
    expect(getDefaultHeadcount("vs1-l3")).toBe(45);
    expect(getDefaultHeadcount("vs1-l4")).toBe(45);
  });

  it("returns 40 for VS2 lines", () => {
    expect(getDefaultHeadcount("vs2-l1")).toBe(40);
    expect(getDefaultHeadcount("vs2-l2")).toBe(40);
  });
});

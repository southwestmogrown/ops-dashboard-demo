import { describe, it, expect } from "vitest";
import {
  getOutputColor,
  getFpyColor,
  getHpuColor,
  getPaceColor,
  getOeeColor,
  calcLinePace,
  getRiskLevel,
  getStatusReasons,
  PILL_STYLE,
  type RiskLevel,
} from "./status";
import type { Line } from "./types";
import type { LineState } from "./mesTypes";
import type { ShiftProgress } from "./shiftTime";

// Helpers to build minimal objects
function makeLine(overrides: Partial<Line> = {}): Line {
  return {
    id: "vs1-l1",
    name: "Folding Line_01",
    valueStream: "VS1",
    output: 200,
    target: 225,
    fpy: 95,
    hpu: 0.35,
    headcount: 45,
    changeovers: 2,
    oee: 0.85,
    availability: 95,
    performance: 92,
    quality: 97,
    ...overrides,
  };
}

function makeLineState(overrides: Partial<LineState> = {}): LineState {
  return {
    lineId: "vs1-l1",
    schedule: {
      lineId: "vs1-l1",
      date: "2026-04-12",
      totalTarget: 225,
      items: [{ model: "M1", qty: 225, completed: 0 }],
    },
    totalOutput: 200,
    currentOrder: "M1",
    remainingOnOrder: 25,
    remainingOnRunSheet: 25,
    completedOrders: 0,
    queuedCount: 0,
    queue: [],
    hourlyOutput: {},
    hourlyChangeovers: {},
    skippedItems: [],
    changeoverRemaining: 0,
    repairRemaining: 0,
    ...overrides,
  };
}

function makeProgress(overrides: Partial<ShiftProgress> = {}): ShiftProgress {
  return {
    elapsedHours: 5,
    remainingHours: 5.5,
    totalHours: 10.5,
    elapsedFraction: 5 / 10.5,
    ...overrides,
  };
}

// ─── getOutputColor ──────────────────────────────────────────────────────────

describe("getOutputColor", () => {
  it("returns green when output >= 90% of target", () => {
    expect(getOutputColor(90, 100)).toBe("text-status-green");
    expect(getOutputColor(100, 100)).toBe("text-status-green");
  });

  it("returns amber when output >= 75% but < 90% of target", () => {
    expect(getOutputColor(75, 100)).toBe("text-status-amber");
    expect(getOutputColor(89, 100)).toBe("text-status-amber");
  });

  it("returns red when output < 75% of target", () => {
    expect(getOutputColor(74, 100)).toBe("text-status-red");
    expect(getOutputColor(0, 100)).toBe("text-status-red");
  });

  it("handles exact boundary at 90%", () => {
    expect(getOutputColor(90, 100)).toBe("text-status-green");
  });

  it("handles exact boundary at 75%", () => {
    expect(getOutputColor(75, 100)).toBe("text-status-amber");
  });
});

// ─── getFpyColor ─────────────────────────────────────────────────────────────

describe("getFpyColor", () => {
  it("returns green when FPY >= 95", () => {
    expect(getFpyColor(95)).toBe("text-status-green");
    expect(getFpyColor(100)).toBe("text-status-green");
  });

  it("returns amber when FPY >= 90 but < 95", () => {
    expect(getFpyColor(90)).toBe("text-status-amber");
    expect(getFpyColor(94.9)).toBe("text-status-amber");
  });

  it("returns red when FPY < 90", () => {
    expect(getFpyColor(89.9)).toBe("text-status-red");
    expect(getFpyColor(0)).toBe("text-status-red");
  });
});

// ─── getHpuColor ─────────────────────────────────────────────────────────────

describe("getHpuColor", () => {
  it("returns green when HPU <= 0.35", () => {
    expect(getHpuColor(0.35)).toBe("text-status-green");
    expect(getHpuColor(0.1)).toBe("text-status-green");
  });

  it("returns amber when HPU > 0.35 but <= 0.45", () => {
    expect(getHpuColor(0.36)).toBe("text-status-amber");
    expect(getHpuColor(0.45)).toBe("text-status-amber");
  });

  it("returns red when HPU > 0.45", () => {
    expect(getHpuColor(0.46)).toBe("text-status-red");
    expect(getHpuColor(1.0)).toBe("text-status-red");
  });
});

// ─── getPaceColor ────────────────────────────────────────────────────────────

describe("getPaceColor", () => {
  it("returns green when projected >= 90% of target", () => {
    expect(getPaceColor(90, 100)).toBe("text-status-green");
  });

  it("returns amber when projected >= 75% but < 90% of target", () => {
    expect(getPaceColor(80, 100)).toBe("text-status-amber");
  });

  it("returns red when projected < 75% of target", () => {
    expect(getPaceColor(50, 100)).toBe("text-status-red");
  });
});

// ─── getOeeColor ─────────────────────────────────────────────────────────────

describe("getOeeColor", () => {
  it("returns green when OEE >= 85", () => {
    expect(getOeeColor(85)).toBe("text-status-green");
    expect(getOeeColor(100)).toBe("text-status-green");
  });

  it("returns amber when OEE >= 70 but < 85", () => {
    expect(getOeeColor(70)).toBe("text-status-amber");
    expect(getOeeColor(84)).toBe("text-status-amber");
  });

  it("returns red when OEE < 70", () => {
    expect(getOeeColor(69)).toBe("text-status-red");
  });
});

// ─── calcLinePace ────────────────────────────────────────────────────────────

describe("calcLinePace", () => {
  it("returns null when elapsed < 0.25 hours", () => {
    expect(calcLinePace(10, 0.1, 10)).toBeNull();
    expect(calcLinePace(10, 0.24, 10)).toBeNull();
  });

  it("projects total output based on current pace", () => {
    // 100 units in 5 hours, 10 hours total → projected 200
    expect(calcLinePace(100, 5, 10)).toBe(200);
  });

  it("rounds to nearest integer", () => {
    // 33 units in 5 hours, 10 hours total → 66
    expect(calcLinePace(33, 5, 10)).toBe(66);
  });

  it("handles zero output", () => {
    expect(calcLinePace(0, 1, 10)).toBe(0);
  });
});

// ─── PILL_STYLE ──────────────────────────────────────────────────────────────

describe("PILL_STYLE", () => {
  it("has entries for all risk levels", () => {
    const levels: RiskLevel[] = ["none", "amber", "red", "unscheduled"];
    for (const level of levels) {
      expect(PILL_STYLE[level]).toBeDefined();
      expect(PILL_STYLE[level].label).toBeTruthy();
      expect(PILL_STYLE[level].cls).toBeTruthy();
    }
  });

  it("maps none to ON TRACK", () => {
    expect(PILL_STYLE.none.label).toBe("ON TRACK");
  });

  it("maps unscheduled to SCHEDULE NEEDED", () => {
    expect(PILL_STYLE.unscheduled.label).toBe("SCHEDULE NEEDED");
  });
});

// ─── getRiskLevel ────────────────────────────────────────────────────────────

describe("getRiskLevel", () => {
  it("returns unscheduled when no schedule and line is running", () => {
    const line = makeLine();
    const state = makeLineState({ schedule: null });
    expect(getRiskLevel(line, state, makeProgress())).toBe("unscheduled");
  });

  it("returns none when no schedule but line is explicitly not running", () => {
    const line = makeLine();
    const state = makeLineState({ schedule: null });
    expect(getRiskLevel(line, state, makeProgress(), false)).toBe("none");
  });

  it("returns none for healthy line with schedule", () => {
    // High output, good FPY, good pace
    const line = makeLine({ output: 200, target: 225, fpy: 95 });
    const state = makeLineState({ totalOutput: 200 });
    const progress = makeProgress({ elapsedHours: 5, totalHours: 10.5 });
    // pace = (200/5)*10.5 = 420, ratio = 420/225 = 1.87 → none
    expect(getRiskLevel(line, state, progress)).toBe("none");
  });

  it("returns red when FPY < 90 and output < target", () => {
    const line = makeLine({ fpy: 85, output: 100, target: 225 });
    const state = makeLineState({ totalOutput: 100 });
    const progress = makeProgress();
    expect(getRiskLevel(line, state, progress)).toBe("red");
  });

  it("returns red when pace ratio < 0.75", () => {
    const line = makeLine({ output: 50, target: 225 });
    const state = makeLineState({ totalOutput: 50 });
    // pace = (50/5)*10.5 = 105, ratio = 105/225 = 0.47 → red
    const progress = makeProgress({ elapsedHours: 5, totalHours: 10.5 });
    expect(getRiskLevel(line, state, progress)).toBe("red");
  });

  it("returns amber when pace ratio is between 0.75 and 0.9", () => {
    const line = makeLine({ output: 100, target: 225, fpy: 95 });
    // Need pace ratio 0.75-0.9: pace = (output/elapsed)*total / target
    // pace = (88/5)*10.5 = 184.8, ratio = 184.8/225 = 0.82 → amber
    const state = makeLineState({ totalOutput: 88 });
    const progress = makeProgress({ elapsedHours: 5, totalHours: 10.5 });
    expect(getRiskLevel(line, state, progress)).toBe("amber");
  });
});

// ─── getStatusReasons ────────────────────────────────────────────────────────

describe("getStatusReasons", () => {
  it("returns 'No schedule loaded' when no schedule", () => {
    const line = makeLine();
    const state = makeLineState({ schedule: null });
    const reasons = getStatusReasons(line, state, makeProgress(), 45, false);
    expect(reasons).toContain("No schedule loaded");
  });

  it("returns empty array when not running and no schedule", () => {
    const line = makeLine();
    const state = makeLineState({ schedule: null });
    const reasons = getStatusReasons(
      line,
      state,
      makeProgress(),
      45,
      false,
      false
    );
    expect(reasons).toEqual([]);
  });

  it("includes 'Line stopped' when downtime is open", () => {
    const line = makeLine();
    const state = makeLineState();
    const reasons = getStatusReasons(
      line,
      state,
      makeProgress(),
      45,
      false,
      true,
      true
    );
    expect(reasons).toContain("Line stopped");
  });

  it("includes 'Zero output' when isZeroOutput is true", () => {
    const line = makeLine();
    const state = makeLineState();
    const reasons = getStatusReasons(
      line,
      state,
      makeProgress(),
      45,
      true,
      true
    );
    expect(reasons).toContain("Zero output");
  });

  it("includes FPY reason when FPY < 90", () => {
    const line = makeLine({ fpy: 85 });
    const state = makeLineState();
    const reasons = getStatusReasons(line, state, makeProgress(), 45, false);
    expect(reasons.some((r) => r.startsWith("FPY low"))).toBe(true);
  });

  it("includes HC short when headcount < planned", () => {
    const line = makeLine({ headcount: 30 });
    const state = makeLineState();
    const progress = makeProgress({ elapsedHours: 1 });
    const reasons = getStatusReasons(line, state, progress, 45, false);
    expect(reasons.some((r) => r.startsWith("HC short"))).toBe(true);
  });

  it("includes skipped orders when present", () => {
    const line = makeLine();
    const state = makeLineState({
      skippedItems: [{ model: "X1", qty: 10, completed: 0, skipped: true }],
    });
    const reasons = getStatusReasons(line, state, makeProgress(), 45, false);
    expect(reasons.some((r) => r.startsWith("Skipped orders"))).toBe(true);
  });
});

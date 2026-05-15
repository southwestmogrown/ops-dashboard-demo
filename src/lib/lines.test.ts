import { describe, it, expect } from "vitest";
import {
  LINES,
  LINE_LABELS,
  LINE_ADMIN_LABELS,
  compareLineOrder,
  getLineLabel,
  getShiftStartHour,
  getDefaultHeadcount,
  getDefaultTarget,
} from "./lines";

describe("LINES", () => {
  it("contains 6 lines", () => {
    expect(LINES).toHaveLength(6);
  });

  it("all have id, name, and valueStream", () => {
    for (const line of LINES) {
      expect(line.id).toBeTruthy();
      expect(line.name).toBeTruthy();
      expect(line.valueStream).toBeTruthy();
    }
  });
});

describe("LINE_LABELS", () => {
  it("has entries for all 6 lines", () => {
    const expectedIds = [
      "vs1-l1",
      "vs1-l2",
      "vs1-l3",
      "vs1-l4",
      "vs2-l1",
      "vs2-l2",
    ];
    for (const id of expectedIds) {
      expect(LINE_LABELS[id]).toBeDefined();
      expect(LINE_LABELS[id]).toBeTruthy();
    }
  });
});

describe("LINE_ADMIN_LABELS", () => {
  it("has entries for all 6 lines", () => {
    const expectedIds = [
      "vs1-l1",
      "vs1-l2",
      "vs1-l3",
      "vs1-l4",
      "vs2-l1",
      "vs2-l2",
    ];
    for (const id of expectedIds) {
      expect(LINE_ADMIN_LABELS[id]).toBeDefined();
      expect(LINE_ADMIN_LABELS[id]).toBeTruthy();
    }
  });
});

describe("getLineLabel", () => {
  it("returns VS · Name format", () => {
    expect(getLineLabel("VS1", "Line 1")).toBe("VS1 · Line 1");
  });

  it("works with VS2 lines", () => {
    expect(getLineLabel("VS2", "Revolver 1")).toBe("VS2 · Revolver 1");
  });
});

describe("getShiftStartHour", () => {
  it("returns 6 for day shift", () => {
    expect(getShiftStartHour("day")).toBe(6);
  });

  it("returns 17 for night shift", () => {
    expect(getShiftStartHour("night")).toBe(17);
  });
});

describe("re-exports", () => {
  it("re-exports getDefaultHeadcount", () => {
    expect(typeof getDefaultHeadcount).toBe("function");
    expect(getDefaultHeadcount("vs1-l1")).toBe(45);
  });

  it("re-exports getDefaultTarget", () => {
    expect(typeof getDefaultTarget).toBe("function");
    expect(getDefaultTarget("vs2-l1")).toBe(200);
  });
});

describe("compareLineOrder", () => {
  it("keeps VS1 lines in canonical top-to-bottom order", () => {
    const unordered = [
      { id: "vs1-l3", name: "Folding Line_03" },
      { id: "vs1-l1", name: "Folding Line_01" },
      { id: "vs1-l2", name: "Folding Line_02" },
    ];
    const ordered = unordered.sort(compareLineOrder);

    expect(ordered.map((line) => line.id)).toEqual([
      "vs1-l1",
      "vs1-l2",
      "vs1-l3",
    ]);
  });

  it("falls back to the line name for unknown ids", () => {
    const unordered = [
      { id: "custom-b", name: "Line B" },
      { id: "custom-a", name: "Line A" },
    ];

    const ordered = unordered.sort(compareLineOrder);

    expect(ordered.map((line) => line.name)).toEqual(["Line A", "Line B"]);
  });
});

import { describe, it, expect } from "vitest";
import { calculateHPU, generateEmailBody } from "./eosReports";
import type { EOSFormData, EOSLineDescriptor } from "./eosTypes";

describe("calculateHPU", () => {
  it("calculates HPU correctly (headcount * hours / output)", () => {
    // headcount=10, hours=8, output=200 → (10*8)/200 = 0.40
    expect(calculateHPU("200", "10", "8")).toBe("0.40");
  });

  it("returns '0' when output is 0", () => {
    expect(calculateHPU("0", "10", "8")).toBe("0");
  });

  it("returns '0' when output is NaN", () => {
    expect(calculateHPU("abc", "10", "8")).toBe("0");
  });

  it("returns '0' when headcount is NaN", () => {
    expect(calculateHPU("100", "abc", "8")).toBe("0");
  });

  it("returns '0' when hoursWorked is NaN", () => {
    expect(calculateHPU("100", "10", "abc")).toBe("0");
  });

  it("handles decimal inputs", () => {
    // headcount=45, hours=8.5, output=225 → (45*8.5)/225 = 1.70
    expect(calculateHPU("225", "45", "8.5")).toBe("1.70");
  });

  it("rounds to 2 decimal places", () => {
    // headcount=3, hours=7, output=100 → 0.21
    expect(calculateHPU("100", "3", "7")).toBe("0.21");
  });
});

describe("generateEmailBody", () => {
  const formData: EOSFormData = {
    supervisor: "John Doe",
    date: "2026-04-12",
    shift: "Day",
    notes: {
      topIssueToday: "Conveyor belt jam on Line 2",
      resolvedDuringShift: "Cleared at 10:15",
      openItemsNextShift: "Check belt tension",
      equipmentConcerns: "Motor running hot",
      generalNotes: "Good shift overall",
    },
    lines: {
      "vs1:Folding Line_01": {
        output: "210",
        hpu: "0.38",
        hoursWorked: "8",
        headcount: "45",
        orderAtPackout: "449324TS",
        remainingOnOrder: "15",
        remainingOnRunSheet: "30",
        changeovers: "2",
        downtimeMinutes: "45",
        downtimeCount: "2",
        openDowntimeCount: "1",
        latestDowntimeReason: "Waiting for Material",
        lineNotes: "Smooth run",
      },
    },
  };

  const activeLines: EOSLineDescriptor[] = [
    {
      vsId: "vs1",
      vsName: "HFC (Hard Folding Covers)",
      line: "Folding Line_01",
      lineKey: "vs1:Folding Line_01",
    },
  ];

  it("includes the stream name in the header", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("End of Shift Report (All Lines)");
  });

  it("includes supervisor name", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("Supervisor: John Doe");
  });

  it("includes shift and date", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("Day Shift");
    expect(body).toContain("2026-04-12");
  });

  it("includes line output data", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("Output: 210");
    expect(body).toContain("HPU: 0.38");
    expect(body).toContain("Headcount: 45");
  });

  it("includes downtime summary data", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("Downtime: 45 min");
    expect(body).toContain("Stops: 2");
    expect(body).toContain("Open Stops: 1");
    expect(body).toContain("Latest Stop: Waiting for Material");
  });

  it("includes operational summary notes", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("Conveyor belt jam on Line 2");
    expect(body).toContain("Cleared at 10:15");
    expect(body).toContain("Check belt tension");
    expect(body).toContain("Motor running hot");
  });

  it("includes report footer", () => {
    const body = generateEmailBody(formData, activeLines, "All Lines");
    expect(body).toContain("Reports attached:");
    expect(body).toContain("Kinetic Command EOS System");
  });

  it("shows (no notes entered) when all notes are empty", () => {
    const emptyNotes: EOSFormData = {
      ...formData,
      notes: {
        topIssueToday: "",
        resolvedDuringShift: "",
        openItemsNextShift: "",
        equipmentConcerns: "",
        generalNotes: "",
      },
    };
    const body = generateEmailBody(emptyNotes, activeLines, "All Lines");
    expect(body).toContain("(no notes entered)");
  });
});

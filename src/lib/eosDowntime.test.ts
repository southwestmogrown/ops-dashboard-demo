import { describe, expect, it } from "vitest";
import { summarizeDowntimeEntries } from "./eosDowntime";
import type { DowntimeEntry } from "./types/downtime";

describe("summarizeDowntimeEntries", () => {
  it("returns zeroed summary for empty lists", () => {
    expect(summarizeDowntimeEntries([], new Date("2026-05-14T10:00:00.000Z"))).toEqual({
      downtimeMinutes: "0",
      downtimeCount: "0",
      openDowntimeCount: "0",
      latestDowntimeReason: "",
    });
  });

  it("sums closed and open downtime entries and exposes the latest reason label", () => {
    const entries: DowntimeEntry[] = [
      {
        id: "DT-001",
        lineId: "vs1-l1",
        shift: "day",
        productionDate: "2026-05-14",
        reason: "angle-saw-down",
        startTime: "2026-05-14T08:00:00.000Z",
        endTime: "2026-05-14T08:15:00.000Z",
        unitsLost: 4,
        notes: "",
      },
      {
        id: "DT-002",
        lineId: "vs1-l1",
        shift: "day",
        productionDate: "2026-05-14",
        reason: "waiting-for-material",
        startTime: "2026-05-14T09:00:00.000Z",
        endTime: null,
        unitsLost: 0,
        notes: "",
      },
    ];

    expect(
      summarizeDowntimeEntries(entries, new Date("2026-05-14T09:20:00.000Z")),
    ).toEqual({
      downtimeMinutes: "35",
      downtimeCount: "2",
      openDowntimeCount: "1",
      latestDowntimeReason: "Waiting for Material",
    });
  });
});

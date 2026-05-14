/**
 * Integration tests for the MES store.
 *
 * We mock the `db.ts` layer entirely — the tests exercise mesStore's
 * in-memory cache logic, queue advancement, scan log, scrap stats, etc.
 * without touching a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db.ts ────────────────────────────────────────────────────────────────
// Every db function is a no-op or returns empty defaults so the store
// initialises cleanly and all writes are just cache mutations.

vi.mock("@/lib/db", () => ({
  runMigrations: vi.fn(async () => {}),
  dbGetAllScans: vi.fn(async () => []),
  dbGetAllQueues: vi.fn(async () => ({})),
  dbGetAdminConfig: vi.fn(async () => ({
    isRunning: true,
    day: { supervisor: "", dailyTarget: 0, headcount: 0, isRunning: true },
    night: { supervisor: "", dailyTarget: 0, headcount: 0, isRunning: true },
  })),
  dbGetAllAdminConfig: vi.fn(async () => ({})),
  dbGetAllComments: vi.fn(async () => ({})),
  dbGetAllScrapEntries: vi.fn(async () => []),
  dbGetSimClock: vi.fn(async () => ({
    clock: null,
    running: false,
    speed: 60,
    sessionStart: null,
    sessionEnd: null,
    sessionStartShift: null,
    handoffCount: 0,
  })),
  dbGetAllDowntimeEntries: vi.fn(async () => []),
  dbGetAllChangeovers: vi.fn(async () => []),
  getSerialCounter: vi.fn(async () => 0),
  setSerialCounter: vi.fn(async () => {}),
  dbInsertScan: vi.fn(async () => {}),
  dbInsertScansBatch: vi.fn(async () => {}),
  dbSetQueue: vi.fn(async () => {}),
  dbDeleteQueue: vi.fn(async () => {}),
  dbSetAdminConfig: vi.fn(async () => {}),
  dbSetComment: vi.fn(async () => {}),
  dbDeleteComment: vi.fn(async () => {}),
  dbInsertScrap: vi.fn(async () => {}),
  dbGetKickedLids: vi.fn(async () => 0),
  dbUpdateScrapEntry: vi.fn(async () => {}),
  dbVoidScrapEntry: vi.fn(async () => {}),
  dbSetSimClock: vi.fn(async () => {}),
  dbResetAll: vi.fn(async () => {}),
  dbResetSimulationData: vi.fn(async () => {}),
  dbInsertDowntime: vi.fn(async () => {}),
  dbCloseDowntime: vi.fn(async () => {}),
  dbInsertChangeover: vi.fn(async () => {}),
  dbClearQueues: vi.fn(async () => {}),
}));

import type { LineSchedule } from "@/lib/mesTypes";
import {
  setSchedule,
  enqueueSchedule,
  getSchedule,
  clearLine,
  getLineState,
  getAllLineStates,
  getOutputForLine,
  tickLine,
  setAdminConfig,
  getAdminConfig,
  getAllAdminConfig,
  setLineComment,
  getLineComments,
  addScrapEntry,
  getScrapEntries,
  getScrapStats,
  setSimClock,
  getSimClock,
  setSimRunning,
  getSimRunning,
  advanceSimClock,
  resetAll,
  addDowntimeEntry,
  getDowntimeEntries,
  closeDowntimeEntry,
  getOpenDowntime,
  getTotalDowntimeMinutes,
} from "@/lib/mesStore";

// Wipe the in-memory global cache between tests
beforeEach(async () => {
  await resetAll();
});

const PROD_DATE = "2026-04-12";

// ── Helper ────────────────────────────────────────────────────────────────────

function makeSchedule(
  lineId: string,
  items: { model: string; qty: number }[],
): LineSchedule {
  return {
    lineId,
    date: "2026-04-12",
    totalTarget: items.reduce((s, i) => s + i.qty, 0),
    items: items.map((i) => ({ ...i, completed: 0 })),
  };
}

// ── Schedule management ──────────────────────────────────────────────────────

describe("Schedule management", () => {
  it("setSchedule stores and returns a schedule", async () => {
    const sched = makeSchedule("vs1-l1", [{ model: "M1", qty: 50 }]);
    await setSchedule("vs1-l1", sched);
    const got = await getSchedule("vs1-l1");
    expect(got).toBeDefined();
    expect(got!.lineId).toBe("vs1-l1");
    expect(got!.items).toHaveLength(1);
  });

  it("setSchedule replaces existing schedule", async () => {
    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "A", qty: 10 }]),
    );
    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "B", qty: 20 }]),
    );
    const got = await getSchedule("vs1-l1");
    expect(got!.items[0].model).toBe("B");
  });

  it("enqueueSchedule appends to queue", async () => {
    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "A", qty: 10 }]),
    );
    await enqueueSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "B", qty: 20 }]),
    );
    const state = await getLineState("vs1-l1");
    expect(state.queuedCount).toBe(1);
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].items[0].model).toBe("B");
  });

  it("clearLine removes all schedules", async () => {
    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "A", qty: 10 }]),
    );
    await clearLine("vs1-l1");
    const got = await getSchedule("vs1-l1");
    expect(got).toBeUndefined();
  });
});

// ── tickLine and output ──────────────────────────────────────────────────────

describe("tickLine", () => {
  it("increments output for a scheduled line", async () => {
    const sched = makeSchedule("vs1-l1", [{ model: "M1", qty: 100 }]);
    await setSchedule("vs1-l1", sched);

    await tickLine("vs1-l1", 5, new Date("2026-04-12T08:00:00Z"));
    const output = await getOutputForLine("vs1-l1");
    expect(output).toBe(5);
  });

  it("does nothing if no schedule exists", async () => {
    await tickLine("vs1-l1", 5, new Date("2026-04-12T08:00:00Z"));
    const output = await getOutputForLine("vs1-l1");
    expect(output).toBe(0);
  });

  it("does not record output during the handoff gap", async () => {
    const sched = makeSchedule("vs1-l1", [{ model: "M1", qty: 100 }]);
    await setSchedule("vs1-l1", sched);

    await tickLine("vs1-l1", 5, new Date("2026-04-12T16:45:00Z"));
    const output = await getOutputForLine("vs1-l1");
    expect(output).toBe(0);
  });

  it("tracks hourly output", async () => {
    const sched = makeSchedule("vs1-l1", [{ model: "M1", qty: 100 }]);
    await setSchedule("vs1-l1", sched);

    await tickLine("vs1-l1", 10, new Date("2026-04-12T08:00:00Z"));
    const state = await getLineState("vs1-l1");
    expect(state.hourlyOutput["08:00"]).toBe(10);
  });

  it("advances to next order when current is complete", async () => {
    const sched = makeSchedule("vs1-l1", [
      { model: "M1", qty: 5 },
      { model: "M2", qty: 10 },
    ]);
    await setSchedule("vs1-l1", sched);

    // Complete order M1 and produce into M2
    await tickLine("vs1-l1", 7, new Date("2026-04-12T08:00:00Z"));
    const state = await getLineState("vs1-l1");
    expect(state.currentOrder).toBe("M2");
    expect(state.totalOutput).toBe(7);
    // M1 completed (5/5), M2 has 2 units done
    expect(state.remainingOnOrder).toBe(8); // 10-2
  });

  it("totalOutput counts all scans across ticks", async () => {
    const sched = makeSchedule("vs1-l1", [{ model: "M1", qty: 100 }]);
    await setSchedule("vs1-l1", sched);

    await tickLine("vs1-l1", 3, new Date("2026-04-12T08:00:00Z"));
    await tickLine("vs1-l1", 7, new Date("2026-04-12T08:00:00Z"));
    const state = await getLineState("vs1-l1");
    expect(state.totalOutput).toBe(10);
  });
});

// ── Line state derivation ────────────────────────────────────────────────────

describe("getLineState", () => {
  it("returns empty state for unscheduled line", async () => {
    const state = await getLineState("vs1-l1");
    expect(state.lineId).toBe("vs1-l1");
    expect(state.schedule).toBeNull();
    expect(state.totalOutput).toBe(0);
    expect(state.currentOrder).toBeNull();
  });

  it("calculates remainingOnRunSheet correctly", async () => {
    const sched = makeSchedule("vs1-l1", [
      { model: "M1", qty: 50 },
      { model: "M2", qty: 50 },
    ]);
    await setSchedule("vs1-l1", sched);
    await tickLine("vs1-l1", 30, new Date("2026-04-12T08:00:00Z"));
    const state = await getLineState("vs1-l1");
    expect(state.remainingOnRunSheet).toBe(70); // 100 total - 30 produced
  });

  it("counts completed orders", async () => {
    const sched = makeSchedule("vs1-l1", [
      { model: "M1", qty: 5 },
      { model: "M2", qty: 5 },
    ]);
    await setSchedule("vs1-l1", sched);
    // Complete both orders
    await tickLine("vs1-l1", 10, new Date("2026-04-12T08:00:00Z"));
    const state = await getLineState("vs1-l1");
    expect(state.completedOrders).toBe(2);
  });

  it("keeps shift-wide changeovers after queue advancement resets active-schedule progress", async () => {
    await setSimRunning(true, 3600);

    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [
        { model: "M1", qty: 1 },
        { model: "M2", qty: 1 },
      ]),
    );
    await enqueueSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "M3", qty: 5 }]),
    );

    await tickLine("vs1-l1", 1, new Date("2026-04-12T08:00:00Z"));
    await tickLine("vs1-l1", 1, new Date("2026-04-12T08:30:00Z"));
    await tickLine("vs1-l1", 1, new Date("2026-04-12T09:00:00Z"));
    await tickLine("vs1-l1", 1, new Date("2026-04-12T10:00:00Z"));

    const state = await getLineState("vs1-l1");

    expect(state.currentOrder).toBe("M3");
    expect(state.completedOrders).toBe(0);
    expect(state.totalChangeovers).toBe(1);
    expect(state.hourlyChangeovers).toEqual({ "08:00": 1 });
  });
});

// ── Admin config ─────────────────────────────────────────────────────────────

describe("Admin config", () => {
  it("returns default config for unconfigured line", async () => {
    const config = await getAdminConfig("vs1-l1");
    expect(config).toEqual({
      isRunning: true,
      day: { supervisor: "", dailyTarget: 0, headcount: 0, isRunning: true },
      night: { supervisor: "", dailyTarget: 0, headcount: 0, isRunning: true },
    });
  });

  it("stores and retrieves config", async () => {
    await setAdminConfig("vs1-l1", {
      isRunning: true,
      day: {
        supervisor: "Alice",
        dailyTarget: 250,
        headcount: 50,
        isRunning: true,
      },
      night: {
        supervisor: "Bob",
        dailyTarget: 200,
        headcount: 40,
        isRunning: false,
      },
    });
    const config = await getAdminConfig("vs1-l1");
    expect(config.day.dailyTarget).toBe(250);
    expect(config.day.headcount).toBe(50);
    expect(config.night.supervisor).toBe("Bob");
    expect(config.night.isRunning).toBe(false);
    expect(config.isRunning).toBe(true);
  });

  it("merges updates into existing config", async () => {
    await setAdminConfig("vs1-l1", {
      day: { dailyTarget: 250 },
    });
    await setAdminConfig("vs1-l1", {
      day: { headcount: 50 },
    });
    const config = await getAdminConfig("vs1-l1");
    expect(config.day.dailyTarget).toBe(250);
    expect(config.day.headcount).toBe(50);
  });

  it("derives the legacy top-level running flag from both shifts", async () => {
    await setAdminConfig("vs1-l1", {
      day: { isRunning: false },
      night: { isRunning: true },
    });
    expect((await getAdminConfig("vs1-l1")).isRunning).toBe(true);

    await setAdminConfig("vs1-l1", {
      night: { isRunning: false },
    });
    const config = await getAdminConfig("vs1-l1");
    expect(config.day.isRunning).toBe(false);
    expect(config.night.isRunning).toBe(false);
    expect(config.isRunning).toBe(false);
  });

  it("getAllAdminConfig returns all configs", async () => {
    await setAdminConfig("vs1-l1", { day: { dailyTarget: 250 } });
    await setAdminConfig("vs2-l1", { day: { dailyTarget: 200 } });
    const all = await getAllAdminConfig();
    expect(Object.keys(all)).toContain("vs1-l1");
    expect(Object.keys(all)).toContain("vs2-l1");
  });
});

// ── Comments ─────────────────────────────────────────────────────────────────

describe("Comments", () => {
  it("returns empty object for unconfigured line", async () => {
    const comments = await getLineComments("vs1-l1", "day", PROD_DATE);
    expect(comments).toEqual({});
  });

  it("stores and retrieves comments by hour", async () => {
    await setLineComment("vs1-l1", "day", PROD_DATE, "08:00", "Started late");
    const comments = await getLineComments("vs1-l1", "day", PROD_DATE);
    expect(comments["08:00"]).toBe("Started late");
  });

  it("deletes comment when empty string is set", async () => {
    await setLineComment("vs1-l1", "day", PROD_DATE, "08:00", "Started late");
    await setLineComment("vs1-l1", "day", PROD_DATE, "08:00", "");
    const comments = await getLineComments("vs1-l1", "day", PROD_DATE);
    expect(comments["08:00"]).toBeUndefined();
  });
});

// ── Scrap ────────────────────────────────────────────────────────────────────

describe("Scrap entries", () => {
  it("adds and retrieves scrap entries", async () => {
    await addScrapEntry({
      kind: "kicked-lid",
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      model: "M1",
      panel: "A",
      damageType: "kicked-lid",
      affectedArea: "panel",
      auditorInitials: "AB",
      boughtIn: false,
    });
    const entries = await getScrapEntries("vs1-l1", "day", PROD_DATE);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("kicked-lid");
    expect(entries[0].id).toMatch(/^SCR-/);
  });

  it("calculates scrap stats correctly", async () => {
    await addScrapEntry({
      kind: "kicked-lid",
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      model: "M1",
      panel: "A",
      damageType: "kicked-lid",
      affectedArea: "panel",
      auditorInitials: "AB",
      boughtIn: false,
    });
    await addScrapEntry({
      kind: "scrapped-panel",
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      model: "M2",
      panel: "B",
      damageType: "Damaged Panel",
      stationFound: "Station 3",
      howDamaged: "Dented",
      boughtIn: true,
    });
    const stats = await getScrapStats("vs1-l1", "day", PROD_DATE);
    expect(stats.kickedLids).toBe(1);
    expect(stats.scrappedPanels).toBe(1);
    expect(stats.totalBoughtIn).toBe(1);
  });

  it("filters entries by line and shift", async () => {
    await addScrapEntry({
      kind: "kicked-lid",
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      model: "M1",
      panel: "A",
      damageType: "kicked-lid",
      affectedArea: "panel",
      auditorInitials: "AB",
      boughtIn: false,
    });
    await addScrapEntry({
      kind: "kicked-lid",
      lineId: "vs2-l1",
      shift: "night",
      productionDate: PROD_DATE,
      model: "M1",
      panel: "A",
      damageType: "kicked-lid",
      affectedArea: "panel",
      auditorInitials: "AB",
      boughtIn: false,
    });
    const vs1Day = await getScrapEntries("vs1-l1", "day", PROD_DATE);
    expect(vs1Day).toHaveLength(1);
    const vs2Night = await getScrapEntries("vs2-l1", "night", PROD_DATE);
    expect(vs2Night).toHaveLength(1);
    const vs1Night = await getScrapEntries("vs1-l1", "night", PROD_DATE);
    expect(vs1Night).toHaveLength(0);
  });
});

// ── Sim clock ────────────────────────────────────────────────────────────────

describe("Sim clock", () => {
  it("stores and retrieves sim clock", async () => {
    const time = new Date("2026-04-12T08:00:00Z");
    await setSimClock(time);
    const got = await getSimClock();
    expect(got).toEqual(time);
  });

  it("setSimRunning toggles running state", async () => {
    await setSimRunning(true);
    expect(await getSimRunning()).toBe(true);
    await setSimRunning(false);
    expect(await getSimRunning()).toBe(false);
  });

  it("advanceSimClock advances by speed seconds", async () => {
    const start = new Date("2026-04-12T08:00:00Z");
    await setSimClock(start);
    await setSimRunning(true, 60);
    await advanceSimClock();
    const got = await getSimClock();
    // Should advance by 60 seconds
    expect(got!.getTime()).toBe(start.getTime() + 60 * 1000);
  });

  it("advanceSimClock does nothing when not running", async () => {
    const start = new Date("2026-04-12T08:00:00Z");
    await setSimClock(start);
    await setSimRunning(false);
    await advanceSimClock();
    const got = await getSimClock();
    expect(got!.getTime()).toBe(start.getTime());
  });
});

// ── Downtime ─────────────────────────────────────────────────────────────────

describe("Downtime", () => {
  it("adds and retrieves downtime entries", async () => {
    await addDowntimeEntry({
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      reason: "machine-failure",
      startTime: "2026-04-12T08:00:00Z",
      endTime: null,
      unitsLost: 0,
      notes: "Motor overheated",
    });
    const entries = await getDowntimeEntries("vs1-l1", "day", PROD_DATE);
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toBe("machine-failure");
    expect(entries[0].id).toMatch(/^DT-/);
  });

  it("getOpenDowntime returns open entry", async () => {
    await addDowntimeEntry({
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      reason: "machine-failure",
      startTime: "2026-04-12T08:00:00Z",
      endTime: null,
      unitsLost: 0,
      notes: "",
    });
    const open = await getOpenDowntime("vs1-l1", "day", PROD_DATE);
    expect(open).not.toBeNull();
    expect(open!.endTime).toBeNull();
  });

  it("closeDowntimeEntry sets end time", async () => {
    const entry = await addDowntimeEntry({
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      reason: "machine-failure",
      startTime: "2026-04-12T08:00:00Z",
      endTime: null,
      unitsLost: 0,
      notes: "",
    });
    await closeDowntimeEntry(entry.id, "2026-04-12T08:30:00Z", 5);
    const closed = await getDowntimeEntries("vs1-l1", "day", PROD_DATE);
    expect(closed[0].endTime).toBe("2026-04-12T08:30:00Z");
    expect(closed[0].unitsLost).toBe(5);
  });

  it("getTotalDowntimeMinutes sums up durations", async () => {
    await addDowntimeEntry({
      lineId: "vs1-l1",
      shift: "day",
      productionDate: PROD_DATE,
      reason: "machine-failure",
      startTime: "2026-04-12T08:00:00Z",
      endTime: "2026-04-12T08:30:00Z",
      unitsLost: 0,
      notes: "",
    });
    const total = await getTotalDowntimeMinutes("vs1-l1", "day", PROD_DATE);
    expect(total).toBe(30);
  });
});

// ── resetAll ─────────────────────────────────────────────────────────────────

describe("resetAll", () => {
  it("clears all state", async () => {
    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "A", qty: 10 }]),
    );
    await tickLine("vs1-l1", 5, new Date("2026-04-12T08:00:00Z"));
    await setAdminConfig("vs1-l1", { day: { dailyTarget: 300 } });
    await setLineComment("vs1-l1", "day", PROD_DATE, "08:00", "note");

    await resetAll();

    expect(await getSchedule("vs1-l1")).toBeUndefined();
    expect(await getOutputForLine("vs1-l1")).toBe(0);
    expect(await getLineComments("vs1-l1", "day", PROD_DATE)).toEqual({});
  });
});

// ── getAllLineStates ──────────────────────────────────────────────────────────

describe("getAllLineStates", () => {
  it("returns states for all lines with activity", async () => {
    await setSchedule(
      "vs1-l1",
      makeSchedule("vs1-l1", [{ model: "A", qty: 10 }]),
    );
    await setSchedule(
      "vs2-l1",
      makeSchedule("vs2-l1", [{ model: "B", qty: 20 }]),
    );
    const states = await getAllLineStates();
    expect(states.length).toBeGreaterThanOrEqual(2);
    const ids = states.map((s) => s.lineId);
    expect(ids).toContain("vs1-l1");
    expect(ids).toContain("vs2-l1");
  });
});

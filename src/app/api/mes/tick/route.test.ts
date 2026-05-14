import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRole = vi.fn(() => null);

vi.mock("@/lib/apiAuth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockTickLine = vi.fn(async () => {});
const mockGetAllLineStates = vi.fn(async () => []);
const mockAdvanceSimClock = vi.fn(async () => {});
const mockGetSimRunning = vi.fn(async () => true);
const mockGetSimClock = vi.fn(async () => new Date("2026-04-12T08:30:00Z"));
const mockGetSimState = vi.fn(async () => ({
  clock: "2026-04-12T08:30:00Z",
  running: true,
  speed: 60,
  timeSource: "simulated" as const,
  currentShift: "day" as const,
  productionDate: "2026-04-12",
  sessionStart: null,
  sessionEnd: null,
  sessionStartShift: "day" as const,
  handoffCount: 0,
}));
const mockAddScrapEntry = vi.fn(async () => {});
const mockAddDowntimeEntry = vi.fn(async () => {});
const mockGetOpenDowntime = vi.fn(async () => null);
const mockGetSimSpeed = vi.fn(async () => 60);
const mockClaimSimUnits = vi.fn(async () => 1);
const mockRefreshCacheFromDb = vi.fn(async () => {});
const mockGetAdminConfig = vi.fn(async () => ({
  isRunning: true,
  day: { supervisor: "", dailyTarget: 225, headcount: 45, isRunning: true },
  night: { supervisor: "", dailyTarget: 225, headcount: 45, isRunning: true },
}));

vi.mock("@/lib/mesStore", () => ({
  tickLine: (...args: unknown[]) => mockTickLine(...args),
  getAllLineStates: (...args: unknown[]) => mockGetAllLineStates(...args),
  advanceSimClock: (...args: unknown[]) => mockAdvanceSimClock(...args),
  getSimRunning: (...args: unknown[]) => mockGetSimRunning(...args),
  getSimClock: (...args: unknown[]) => mockGetSimClock(...args),
  getSimState: (...args: unknown[]) => mockGetSimState(...args),
  addScrapEntry: (...args: unknown[]) => mockAddScrapEntry(...args),
  addDowntimeEntry: (...args: unknown[]) => mockAddDowntimeEntry(...args),
  getOpenDowntime: (...args: unknown[]) => mockGetOpenDowntime(...args),
  getSimSpeed: (...args: unknown[]) => mockGetSimSpeed(...args),
  claimSimUnits: (...args: unknown[]) => mockClaimSimUnits(...args),
  refreshCacheFromDb: (...args: unknown[]) => mockRefreshCacheFromDb(...args),
  getAdminConfig: (...args: unknown[]) => mockGetAdminConfig(...args),
}));

import { POST } from "@/app/api/mes/tick/route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/mes/tick", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockReturnValue(null);
  // Keep simulator-side randomness deterministic so skip/downtime/defect branches
  // do not interfere with route assertions in these tests.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});

describe("POST /api/mes/tick", () => {
  it("does not add scans during the handoff gap", async () => {
    mockGetSimState.mockResolvedValue({
      clock: "2026-04-12T16:45:00Z",
      running: true,
      speed: 60,
      timeSource: "simulated",
      currentShift: null,
      productionDate: "2026-04-12",
      sessionStart: null,
      sessionEnd: null,
      sessionStartShift: "day",
      handoffCount: 1,
    });
    mockGetSimClock.mockResolvedValue(new Date("2026-04-12T16:45:00Z"));

    const res = await POST(makeReq({ all: true, units: 0.6 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scansAdded: 0 });
    expect(mockTickLine).not.toHaveBeenCalled();
    expect(mockGetAllLineStates).not.toHaveBeenCalled();
  });

  it("skips lines that are off for the current shift", async () => {
    mockGetAllLineStates.mockResolvedValue([
      {
        lineId: "vs1-l1",
        shift: "night",
        productionDate: "2026-04-12",
        contextKey: "2026-04-12:night",
        schedule: { lineId: "vs1-l1", date: "2026-04-12", totalTarget: 50, items: [] },
        totalOutput: 0,
        currentOrder: "A",
        remainingOnOrder: 50,
        remainingOnRunSheet: 50,
        completedOrders: 0,
        queuedCount: 0,
        queue: [],
        hourlyOutput: {},
        hourlyChangeovers: {},
        totalChangeovers: 0,
        skippedItems: [],
        changeoverRemaining: 0,
        repairRemaining: 0,
      },
      {
        lineId: "vs2-l1",
        shift: "night",
        productionDate: "2026-04-12",
        contextKey: "2026-04-12:night",
        schedule: { lineId: "vs2-l1", date: "2026-04-12", totalTarget: 50, items: [] },
        totalOutput: 0,
        currentOrder: "B",
        remainingOnOrder: 50,
        remainingOnRunSheet: 50,
        completedOrders: 0,
        queuedCount: 0,
        queue: [],
        hourlyOutput: {},
        hourlyChangeovers: {},
        totalChangeovers: 0,
        skippedItems: [],
        changeoverRemaining: 0,
        repairRemaining: 0,
      },
    ]);
    mockGetSimState.mockResolvedValue({
      clock: "2026-04-12T18:00:00Z",
      running: true,
      speed: 60,
      timeSource: "simulated",
      currentShift: "night",
      productionDate: "2026-04-12",
      sessionStart: null,
      sessionEnd: null,
      sessionStartShift: "day",
      handoffCount: 1,
    });
    mockGetSimClock.mockResolvedValue(new Date("2026-04-12T18:00:00Z"));
    mockGetAdminConfig
      .mockResolvedValueOnce({
        isRunning: true,
        day: { supervisor: "", dailyTarget: 225, headcount: 45, isRunning: true },
        night: { supervisor: "", dailyTarget: 225, headcount: 45, isRunning: false },
      })
      .mockResolvedValueOnce({
        isRunning: true,
        day: { supervisor: "", dailyTarget: 200, headcount: 40, isRunning: true },
        night: { supervisor: "", dailyTarget: 200, headcount: 40, isRunning: true },
      });

    const res = await POST(makeReq({ all: true, units: 0.6 }));

    expect(res.status).toBe(200);
    expect(mockTickLine).toHaveBeenCalledTimes(1);
    expect(mockTickLine).toHaveBeenCalledWith("vs2-l1", 1);
  });

  it("uses work-minute compensated units while a shift is active", async () => {
    mockGetAllLineStates.mockResolvedValue([
      {
        lineId: "vs1-l1",
        shift: "day",
        productionDate: "2026-04-12",
        contextKey: "2026-04-12:day",
        schedule: { lineId: "vs1-l1", date: "2026-04-12", totalTarget: 50, items: [] },
        totalOutput: 0,
        currentOrder: "A",
        remainingOnOrder: 50,
        remainingOnRunSheet: 50,
        completedOrders: 0,
        queuedCount: 0,
        queue: [],
        hourlyOutput: {},
        hourlyChangeovers: {},
        totalChangeovers: 0,
        skippedItems: [],
        changeoverRemaining: 0,
        repairRemaining: 0,
      },
    ]);

    await POST(makeReq({ all: true, units: 0 }));

    expect(mockClaimSimUnits).toHaveBeenCalledWith(
      "vs1-l1",
      0.681081081081081,
    );
  });
});

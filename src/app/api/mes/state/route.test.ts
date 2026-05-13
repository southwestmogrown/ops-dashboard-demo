import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mesStore", () => ({
  getAllLineStates: vi.fn(async () => [
    {
      lineId: "vs1-l1",
      shift: "day",
      productionDate: "2026-04-12",
      contextKey: "2026-04-12:day",
      schedule: null,
      totalOutput: 0,
      hourlyOutput: {},
      hourlyChangeovers: {},
      totalChangeovers: 0,
      currentOrder: null,
      remainingOnOrder: 0,
      remainingOnRunSheet: 0,
      completedOrders: 0,
      queuedCount: 0,
      queue: [],
      skippedItems: [],
      changeoverRemaining: 0,
      repairRemaining: 0,
    },
    {
      lineId: "vs2-l1",
      shift: "day",
      productionDate: "2026-04-12",
      contextKey: "2026-04-12:day",
      schedule: null,
      totalOutput: 0,
      hourlyOutput: {},
      hourlyChangeovers: {},
      totalChangeovers: 0,
      currentOrder: null,
      remainingOnOrder: 0,
      remainingOnRunSheet: 0,
      completedOrders: 0,
      queuedCount: 0,
      queue: [],
      skippedItems: [],
      changeoverRemaining: 0,
      repairRemaining: 0,
    },
  ]),
  getOperatingTime: vi.fn(async () => ({
    now: new Date("2026-04-12T08:00:00Z"),
    timeSource: "realtime",
    currentShift: "day",
    productionDate: "2026-04-12",
  })),
  refreshCacheFromDb: vi.fn(async () => {}),
}));

import { GET } from "@/app/api/mes/state/route";
import { getAllLineStates } from "@/lib/mesStore";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mes/state", () => {
  it("returns line states as JSON array", async () => {
    const req = new NextRequest("http://localhost/api/mes/state?shift=day");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(getAllLineStates).toHaveBeenCalled();
  });

  it("falls back to the operating shift when query shift is omitted", async () => {
    const req = new NextRequest("http://localhost/api/mes/state");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getAllLineStates).toHaveBeenCalledWith({
      shift: "day",
      productionDate: "2026-04-12",
    });
  });
});

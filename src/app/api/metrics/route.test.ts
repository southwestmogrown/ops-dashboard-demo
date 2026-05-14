import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/generateMetrics", () => ({
  generateMetrics: vi.fn(() => ({
    shift: "day",
    generatedAt: "2026-04-12T08:00:00Z",
    productionDate: "2026-04-12",
    contextKey: "2026-04-12:day",
    timeSource: "realtime",
    mode: "baseline",
    lines: [
      {
        id: "vs1-l1",
        name: "Line 1",
        valueStream: "VS1",
        output: 0,
        target: 0,
        fpy: 100,
        hpu: 0,
        headcount: 0,
        changeovers: 0,
        oee: 0,
        availability: 100,
        performance: 100,
        quality: 100,
      },
    ],
    trend: [],
  })),
  getDefaultHeadcount: vi.fn(() => 45),
  getDefaultTarget: vi.fn(() => 225),
}));

vi.mock("@/lib/mesStore", () => ({
  getAdminConfig: vi.fn(async () => ({
    isRunning: true,
    day: { supervisor: "", dailyTarget: 0, headcount: 0 },
    night: { supervisor: "", dailyTarget: 0, headcount: 0 },
  })),
  getAllLineStates: vi.fn(async () => [
    {
      lineId: "vs1-l1",
      shift: "day",
      productionDate: "2026-04-12",
      contextKey: "2026-04-12:day",
      schedule: {
        lineId: "vs1-l1",
        date: "2026-04-12",
        totalTarget: 50,
        items: [{ model: "M2", qty: 50, completed: 25 }],
      },
      totalOutput: 25,
      currentOrder: "M2",
      remainingOnOrder: 25,
      remainingOnRunSheet: 25,
      completedOrders: 1,
      queuedCount: 0,
      queue: [],
      hourlyOutput: { "08:00": 25 },
      hourlyChangeovers: { "07:00": 4 },
      totalChangeovers: 4,
      skippedItems: [],
      changeoverRemaining: 0,
      repairRemaining: 0,
    },
  ]),
  getDowntimeEntries: vi.fn(async () => []),
  getKickedLidsForLineShift: vi.fn(async () => 0),
  getOperatingTime: vi.fn(async () => ({
    now: new Date("2026-04-12T08:00:00Z"),
    timeSource: "realtime",
    currentShift: "day",
    productionDate: "2026-04-12",
  })),
  getOutputForLineShift: vi.fn(async () => 25),
  refreshCacheFromDb: vi.fn(async () => {}),
}));

vi.mock("@/lib/shiftTime", () => ({
  getShiftContext: vi.fn(() => ({
    currentTime: new Date("2026-04-12T08:00:00Z"),
    shiftStart: new Date("2026-04-12T06:00:00Z"),
    shiftEnd: new Date("2026-04-12T15:00:00Z"),
    totalHours: 9,
    elapsedHours: 2,
    productionDate: "2026-04-12",
    contextKey: "2026-04-12:day",
  })),
}));

import { GET } from "@/app/api/metrics/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/metrics", () => {
  it("uses shift-wide changeover totals in the metrics payload", async () => {
    const req = new NextRequest("http://localhost/api/metrics?shift=day");
    const res = await GET(req);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.lines[0].changeovers).toBe(4);
  });
});

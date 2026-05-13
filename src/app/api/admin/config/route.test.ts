import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mesStore", () => ({
  getAdminConfig: vi.fn(async () => ({
    isRunning: true,
    day: { supervisor: "", dailyTarget: 225, headcount: 45 },
    night: { supervisor: "", dailyTarget: 200, headcount: 40 },
  })),
  setAdminConfig: vi.fn(async () => {}),
  getAllAdminConfig: vi.fn(async () => ({
    "vs1-l1": {
      isRunning: true,
      day: { supervisor: "", dailyTarget: 225, headcount: 45 },
      night: { supervisor: "", dailyTarget: 200, headcount: 40 },
    },
    "vs2-l1": {
      isRunning: true,
      day: { supervisor: "", dailyTarget: 200, headcount: 40 },
      night: { supervisor: "", dailyTarget: 180, headcount: 35 },
    },
  })),
  refreshCacheFromDb: vi.fn(async () => {}),
}));

const mockRequireRole = vi.fn(() => null);
vi.mock("@/lib/apiAuth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { GET, POST } from "@/app/api/admin/config/route";
import { getAdminConfig, setAdminConfig, getAllAdminConfig } from "@/lib/mesStore";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockReturnValue(null);
});

describe("GET /api/admin/config", () => {
  it("returns all admin configs", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body["vs1-l1"]).toBeDefined();
    expect(body["vs1-l1"].day.dailyTarget).toBe(225);
    expect(getAllAdminConfig).toHaveBeenCalled();
  });
});

describe("POST /api/admin/config", () => {
  it("updates config and returns 200", async () => {
    const req = new NextRequest("http://localhost/api/admin/config", {
      method: "POST",
      body: JSON.stringify({
        lineId: "vs1-l1",
        shift: "day",
        shiftConfig: { dailyTarget: 250, headcount: 50 },
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(setAdminConfig).toHaveBeenCalledWith(
      "vs1-l1",
      expect.objectContaining({
        day: expect.objectContaining({
          dailyTarget: 250,
          headcount: 50,
        }),
      }),
    );
  });

  it("returns 400 when lineId is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/config", {
      method: "POST",
      body: JSON.stringify({ shift: "day", shiftConfig: { dailyTarget: 250 } }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth fails", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    );
    const req = new NextRequest("http://localhost/api/admin/config", {
      method: "POST",
      body: JSON.stringify({ lineId: "vs1-l1", shift: "day", shiftConfig: { dailyTarget: 250 } }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(setAdminConfig).not.toHaveBeenCalled();
  });

  it("coerces types correctly", async () => {
    const req = new NextRequest("http://localhost/api/admin/config", {
      method: "POST",
      body: JSON.stringify({
        lineId: "vs1-l1",
        shift: "night",
        shiftConfig: {
          dailyTarget: "300",
          supervisor: "Jane",
        },
        isRunning: true,
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getAdminConfig).toHaveBeenCalledWith("vs1-l1");
    expect(setAdminConfig).toHaveBeenCalledWith(
      "vs1-l1",
      expect.objectContaining({
        isRunning: true,
        night: expect.objectContaining({
          dailyTarget: 300,
          supervisor: "Jane",
        }),
      }),
    );
  });
});

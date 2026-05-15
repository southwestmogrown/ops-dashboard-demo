import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mesStore", () => ({
  addDowntimeEntry: vi.fn(async (entry: Record<string, unknown>) => ({
    ...entry,
    id: "DT-001",
  })),
  getDowntimeEntries: vi.fn(async () => []),
  closeDowntimeEntry: vi.fn(async () => {}),
  getAllDowntimeEntriesForShift: vi.fn(async () => []),
  getAllAdminConfig: vi.fn(async () => ({})),
  getAllLineStates: vi.fn(async () => []),
  getOperatingTime: vi.fn(async () => ({
    now: new Date("2026-04-12T08:00:00Z"),
    timeSource: "realtime",
    currentShift: "day",
    productionDate: "2026-04-12",
  })),
  refreshCacheFromDb: vi.fn(async () => {}),
}));

const mockRequireRole = vi.fn(() => null);
const mockGetRequestRole = vi.fn(() => "team-lead");

vi.mock("@/lib/apiAuth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  getRequestRole: (...args: unknown[]) => mockGetRequestRole(...args),
}));

import { POST } from "@/app/api/downtime/route";

describe("POST /api/downtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockReturnValue(null);
    mockGetRequestRole.mockReturnValue("team-lead");
  });

  it("accepts the new line stop reasons", async () => {
    const req = new NextRequest("http://localhost/api/downtime", {
      method: "POST",
      body: JSON.stringify({
        lineId: "vs1-l1",
        shift: "day",
        reason: "angle-saw-down",
        startTime: "2026-04-12T08:00:00Z",
        createdBy: "AB",
        notes: "Saw offline",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  it("rejects deprecated downtime reasons", async () => {
    const req = new NextRequest("http://localhost/api/downtime", {
      method: "POST",
      body: JSON.stringify({
        lineId: "vs1-l1",
        shift: "day",
        reason: "operator-break",
        startTime: "2026-04-12T08:00:00Z",
        createdBy: "AB",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid reason value" });
  });
});

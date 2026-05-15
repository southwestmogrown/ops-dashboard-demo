import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mesStore", () => ({
  addScrapEntry: vi.fn(async (entry: Record<string, unknown>) => ({
    ...entry,
    id: "SCR-001",
    timestamp: "2026-04-12T08:00:00Z",
  })),
  getScrapEntries: vi.fn(async () => [
    { id: "SCR-001", lineId: "vs1-l1", shift: "day", kind: "kicked-lid" },
  ]),
  getAllScrapEntries: vi.fn(async () => [
    { id: "SCR-001", lineId: "vs1-l1", shift: "day", kind: "kicked-lid" },
    { id: "SCR-002", lineId: "vs2-l1", shift: "day", kind: "scrapped-panel" },
  ]),
  getOperatingTime: vi.fn(async () => ({
    now: new Date("2026-04-12T08:00:00Z"),
    timeSource: "realtime",
    currentShift: "day",
    productionDate: "2026-04-12",
  })),
  voidScrapEntry: vi.fn(async () => true),
  updateScrapEntry: vi.fn(async (id: string, updates: Record<string, unknown>) => ({
    id,
    ...updates,
  })),
  refreshCacheFromDb: vi.fn(async () => {}),
}));

const mockRequireRole = vi.fn(() => null);
vi.mock("@/lib/apiAuth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { GET, POST, PATCH } from "@/app/api/scrap/route";
import { addScrapEntry, getScrapEntries, getAllScrapEntries, voidScrapEntry } from "@/lib/mesStore";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockReturnValue(null);
});

describe("GET /api/scrap", () => {
  it("returns entries for a specific line", async () => {
    const req = new NextRequest(
      "http://localhost/api/scrap?lineId=vs1-l1&shift=day",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getScrapEntries).toHaveBeenCalledWith("vs1-l1", "day", "2026-04-12");
  });

  it("returns all entries when lineId=all", async () => {
    const req = new NextRequest(
      "http://localhost/api/scrap?lineId=all&shift=day",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getAllScrapEntries).toHaveBeenCalledWith("day", "2026-04-12");
  });

  it("returns 400 when shift is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/scrap?lineId=vs1-l1",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when lineId is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/scrap?shift=day",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth fails", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    );
    const req = new NextRequest(
      "http://localhost/api/scrap?lineId=vs1-l1&shift=day",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/scrap", () => {
  it("creates a kicked-lid entry", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "POST",
      body: JSON.stringify({
        kind: "kicked-lid",
        lineId: "vs1-l1",
        shift: "day",
        model: "M1",
        panel: "A",
        quantity: 2,
        createdBy: "AB",
        reasonCode: "WS / WORKSTATION SURFACE",
        damageType: "kicked-lid",
        affectedArea: "panel",
        auditorInitials: "ab",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(addScrapEntry).toHaveBeenCalled();
  });

  it("creates a scrapped-panel entry", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "POST",
      body: JSON.stringify({
        kind: "scrapped-panel",
        lineId: "vs1-l1",
        shift: "day",
        model: "M2",
        panel: "B",
        quantity: 3,
        createdBy: "CD",
        reasonCode: "MC / MIS-CUT / FABRICATED INCORRECTLY",
        damageType: "SC / SCRATCH",
        stationFound: "Station 3",
        howDamaged: "Dented",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(addScrapEntry).toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "POST",
      body: JSON.stringify({ kind: "kicked-lid" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid kind", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "POST",
      body: JSON.stringify({
        kind: "invalid",
        lineId: "vs1-l1",
        shift: "day",
        model: "M1",
        panel: "A",
        damageType: "kicked-lid",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/scrap", () => {
  it("voids a scrap entry", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "PATCH",
      body: JSON.stringify({
        id: "SCR-001",
        void: true,
        voidReason: "Duplicate entry",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(voidScrapEntry).toHaveBeenCalledWith("SCR-001", "Duplicate entry");
  });

  it("returns 400 when void is true but voidReason is missing", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "PATCH",
      body: JSON.stringify({ id: "SCR-001", void: true }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when id is missing", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "PATCH",
      body: JSON.stringify({ void: true, voidReason: "Test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither void nor updates provided", async () => {
    const req = new NextRequest("http://localhost/api/scrap", {
      method: "PATCH",
      body: JSON.stringify({ id: "SCR-001" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

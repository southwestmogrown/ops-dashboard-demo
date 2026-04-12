import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock mesStore ─────────────────────────────────────────────────────────────
vi.mock("@/lib/mesStore", () => ({
  setSchedule: vi.fn(async () => {}),
  enqueueSchedule: vi.fn(async () => {}),
  clearLine: vi.fn(async () => {}),
  skipOrder: vi.fn(async () => true),
  unskipOrder: vi.fn(async () => true),
}));

// ── Mock apiAuth ──────────────────────────────────────────────────────────────
const mockRequireRole = vi.fn(() => null);
vi.mock("@/lib/apiAuth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { POST, DELETE, PATCH } from "@/app/api/mes/schedule/route";
import { setSchedule, enqueueSchedule, clearLine } from "@/lib/mesStore";

function makeReq(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/mes/schedule", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockReturnValue(null); // auth passes
});

describe("POST /api/mes/schedule", () => {
  it("returns 200 for valid replace schedule", async () => {
    const body = {
      lineId: "vs1-l1",
      schedule: { lineId: "vs1-l1", date: "2026-04-12", totalTarget: 100, items: [] },
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(200);
    expect(setSchedule).toHaveBeenCalledWith("vs1-l1", expect.any(Object));
  });

  it("calls enqueueSchedule when mode=queue", async () => {
    const body = {
      lineId: "vs1-l1",
      schedule: { lineId: "vs1-l1", date: "2026-04-12", totalTarget: 100, items: [] },
      mode: "queue",
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(200);
    expect(enqueueSchedule).toHaveBeenCalled();
  });

  it("returns 400 when lineId missing", async () => {
    const res = await POST(makeReq({ schedule: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when schedule missing", async () => {
    const res = await POST(makeReq({ lineId: "vs1-l1" }));
    expect(res.status).toBe(400);
  });

  it("returns 401/403 when auth fails", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    );
    const res = await POST(makeReq({ lineId: "vs1-l1", schedule: {} }));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/mes/schedule", () => {
  it("clears line queue", async () => {
    const req = new NextRequest("http://localhost/api/mes/schedule", {
      method: "DELETE",
      body: JSON.stringify({ lineId: "vs1-l1" }),
      headers: { "content-type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(clearLine).toHaveBeenCalledWith("vs1-l1");
  });

  it("returns 400 when lineId missing", async () => {
    const req = new NextRequest("http://localhost/api/mes/schedule", {
      method: "DELETE",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/mes/schedule", () => {
  it("returns 400 when required fields missing", async () => {
    const req = new NextRequest("http://localhost/api/mes/schedule", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

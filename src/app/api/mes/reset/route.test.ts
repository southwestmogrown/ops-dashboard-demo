import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mesStore", () => ({
  resetAll: vi.fn(async () => {}),
}));

const mockRequireRole = vi.fn(() => null);
vi.mock("@/lib/apiAuth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { POST } from "@/app/api/mes/reset/route";
import { resetAll } from "@/lib/mesStore";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockReturnValue(null);
});

describe("POST /api/mes/reset", () => {
  it("calls resetAll and returns 200", async () => {
    const req = new NextRequest("http://localhost/api/mes/reset", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(resetAll).toHaveBeenCalled();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 401 when auth fails", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    );
    const req = new NextRequest("http://localhost/api/mes/reset", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(resetAll).not.toHaveBeenCalled();
  });
});

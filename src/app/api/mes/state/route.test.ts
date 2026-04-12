import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mesStore", () => ({
  getAllLineStates: vi.fn(async () => [
    { lineId: "vs1-l1", schedule: null, totalOutput: 0, hourlyOutput: {} },
    { lineId: "vs2-l1", schedule: null, totalOutput: 0, hourlyOutput: {} },
  ]),
  refreshCacheFromDb: vi.fn(async () => {}),
}));

import { GET } from "@/app/api/mes/state/route";
import { getAllLineStates } from "@/lib/mesStore";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mes/state", () => {
  it("returns line states as JSON array", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(getAllLineStates).toHaveBeenCalled();
  });
});

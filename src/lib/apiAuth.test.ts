import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock the auth module's pin lookup
vi.mock("@/lib/types/auth", () => ({
  getPinForRole: (role: string) =>
    role === "supervisor" ? "ops2026" : "lead2026",
  SUPERVISOR_PIN: "ops2026",
  TEAM_LEAD_PIN: "lead2026",
}));

import { requireRole, getRequestRole } from "./apiAuth";

// Helper to create a minimal NextRequest-like object
function makeRequest(options?: {
  cookieRole?: string;
  headerRole?: string;
  headerPin?: string;
}): NextRequest {
  const headers = new Headers();
  if (options?.headerRole) headers.set("x-ops-role", options.headerRole);
  if (options?.headerPin) headers.set("x-ops-pin", options.headerPin);

  const cookies = new Map<string, { name: string; value: string }>();
  if (options?.cookieRole) {
    cookies.set("ops-role", {
      name: "ops-role",
      value: options.cookieRole,
    });
  }

  return {
    headers,
    cookies: {
      get: (name: string) => cookies.get(name),
    },
  } as unknown as NextRequest;
}

describe("getRequestRole", () => {
  it("returns role from header when pin matches", () => {
    const req = makeRequest({
      headerRole: "supervisor",
      headerPin: "ops2026",
    });
    expect(getRequestRole(req)).toBe("supervisor");
  });

  it("returns team-lead role from header when pin matches", () => {
    const req = makeRequest({
      headerRole: "team-lead",
      headerPin: "lead2026",
    });
    expect(getRequestRole(req)).toBe("team-lead");
  });

  it("returns null when header pin is wrong", () => {
    const req = makeRequest({
      headerRole: "supervisor",
      headerPin: "wrong",
    });
    expect(getRequestRole(req)).toBeNull();
  });

  it("falls back to cookie when no headers", () => {
    const req = makeRequest({ cookieRole: "supervisor" });
    expect(getRequestRole(req)).toBe("supervisor");
  });

  it("returns null when no auth present", () => {
    const req = makeRequest();
    expect(getRequestRole(req)).toBeNull();
  });

  it("returns null for invalid role in cookie", () => {
    const req = makeRequest({ cookieRole: "admin" });
    expect(getRequestRole(req)).toBeNull();
  });

  it("prefers header over cookie", () => {
    const req = makeRequest({
      headerRole: "team-lead",
      headerPin: "lead2026",
      cookieRole: "supervisor",
    });
    expect(getRequestRole(req)).toBe("team-lead");
  });
});

describe("requireRole", () => {
  it("returns null (pass) when role matches allowed", () => {
    const req = makeRequest({
      headerRole: "supervisor",
      headerPin: "ops2026",
    });
    const result = requireRole(req, "supervisor");
    expect(result).toBeNull();
  });

  it("returns null when role matches one of allowed array", () => {
    const req = makeRequest({
      headerRole: "team-lead",
      headerPin: "lead2026",
    });
    const result = requireRole(req, ["supervisor", "team-lead"]);
    expect(result).toBeNull();
  });

  it("returns 401 when no role present", () => {
    const req = makeRequest();
    const result = requireRole(req, "supervisor");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 403 when role is not in allowed list", () => {
    const req = makeRequest({
      headerRole: "team-lead",
      headerPin: "lead2026",
    });
    const result = requireRole(req, "supervisor");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

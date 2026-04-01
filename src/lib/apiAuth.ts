import { NextRequest, NextResponse } from "next/server";
import { getPinForRole, type UserRole } from "@/lib/types/auth";

const VALID_ROLES: UserRole[] = ["supervisor", "team-lead"];

function getRoleFromCookie(request: NextRequest): UserRole | null {
  const raw = request.cookies.get("ops-role")?.value;
  if (!raw) return null;
  return VALID_ROLES.includes(raw as UserRole) ? (raw as UserRole) : null;
}

function getRoleFromHeaders(request: NextRequest): UserRole | null {
  const role = request.headers.get("x-ops-role");
  const pin = request.headers.get("x-ops-pin");
  if (!role || !pin) return null;
  if (!VALID_ROLES.includes(role as UserRole)) return null;
  const typedRole = role as UserRole;
  return pin === getPinForRole(typedRole) ? typedRole : null;
}

function getRoleFromRequest(request: NextRequest): UserRole | null {
  return getRoleFromHeaders(request) ?? getRoleFromCookie(request);
}

export function requireRole(
  request: NextRequest,
  allowedRoles: UserRole | UserRole[],
): NextResponse | null {
  const role = getRoleFromRequest(request);
  if (!role) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return null;
}

export function getRequestRole(request: NextRequest): UserRole | null {
  return getRoleFromRequest(request);
}

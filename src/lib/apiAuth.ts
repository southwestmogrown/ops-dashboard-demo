import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/lib/authTypes";

const VALID_ROLES: UserRole[] = ["supervisor", "team-lead"];

function getRoleFromCookie(request: NextRequest): UserRole | null {
  const raw = request.cookies.get("ops-role")?.value;
  if (!raw) return null;
  return VALID_ROLES.includes(raw as UserRole) ? (raw as UserRole) : null;
}

export function requireRole(
  request: NextRequest,
  allowedRoles: UserRole | UserRole[],
): NextResponse | null {
  const role = getRoleFromCookie(request);
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
  return getRoleFromCookie(request);
}

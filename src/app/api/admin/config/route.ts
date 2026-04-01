import { NextRequest, NextResponse } from "next/server";
import { setAdminConfig, getAllAdminConfig, refreshCacheFromDb } from "@/lib/mesStore";
import type { AdminLineConfig } from "@/lib/types/mes";
import { requireRole } from "@/lib/apiAuth";

export async function GET(): Promise<NextResponse> {
  // Keep read access lightweight for all dashboard roles.
  await refreshCacheFromDb();
  return NextResponse.json(await getAllAdminConfig());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  const body = await request.json() as { lineId: string } & AdminLineConfig;

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId is required" }, { status: 400 });
  }

  const config: AdminLineConfig = {};
  if (body.target           !== undefined) config.target           = Number(body.target);
  if (body.headcount        !== undefined) config.headcount        = Number(body.headcount);
  if (body.isRunning        !== undefined) config.isRunning        = Boolean(body.isRunning);
  if (body.supervisorName   !== undefined) config.supervisorName   = String(body.supervisorName);

  await setAdminConfig(body.lineId, config);
  return NextResponse.json({ ok: true });
}

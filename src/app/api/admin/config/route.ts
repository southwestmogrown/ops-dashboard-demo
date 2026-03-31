import { NextRequest, NextResponse } from "next/server";
import { setAdminConfig, getAllAdminConfig, refreshCacheFromDb } from "@/lib/mesStore";
import type { AdminLineConfig } from "@/lib/mesTypes";

export async function GET(): Promise<NextResponse> {
  await refreshCacheFromDb();
  return NextResponse.json(await getAllAdminConfig());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

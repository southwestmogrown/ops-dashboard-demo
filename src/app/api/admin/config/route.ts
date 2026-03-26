import { NextRequest, NextResponse } from "next/server";
import { setAdminConfig, getAllAdminConfig } from "@/lib/mesStore";
import type { AdminLineConfig } from "@/lib/mesStore";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getAllAdminConfig());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as { lineId: string } & AdminLineConfig;

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId is required" }, { status: 400 });
  }

  const config: AdminLineConfig = {};
  if (body.target    !== undefined) config.target    = Number(body.target);
  if (body.headcount !== undefined) config.headcount = Number(body.headcount);

  setAdminConfig(body.lineId, config);
  return NextResponse.json({ ok: true });
}

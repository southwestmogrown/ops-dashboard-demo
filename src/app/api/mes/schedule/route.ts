import { NextRequest, NextResponse } from "next/server";
import { setSchedule } from "@/lib/mesStore";
import type { LineSchedule } from "@/lib/mesTypes";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as { lineId: string; schedule: LineSchedule };

  if (!body.lineId || !body.schedule) {
    return NextResponse.json({ error: "lineId and schedule are required" }, { status: 400 });
  }

  setSchedule(body.lineId, body.schedule);
  return NextResponse.json({ ok: true });
}

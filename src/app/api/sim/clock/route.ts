import { NextRequest, NextResponse } from "next/server";
import {
  getSimClock,
  getSimRunning,
  getSimSpeed,
  setSimClock,
  setSimRunning,
} from "@/lib/mesStore";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    clock: getSimClock()?.toISOString() ?? null,
    running: getSimRunning(),
    speed: getSimSpeed(),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.clock !== undefined) {
    if (body.clock === null) {
      setSimClock(null);
    } else {
      const d = new Date(body.clock as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid clock date" }, { status: 400 });
      }
      setSimClock(d);
    }
  }

  if (body.running !== undefined) {
    setSimRunning(Boolean(body.running), body.speed as number | undefined);
  } else if (body.speed !== undefined) {
    // Only update speed when running state is already managed
    setSimRunning(getSimRunning(), body.speed as number);
  }

  return NextResponse.json({ ok: true });
}

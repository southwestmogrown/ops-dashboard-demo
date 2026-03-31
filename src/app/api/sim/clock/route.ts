import { NextRequest, NextResponse } from "next/server";
import {
  getSimClock,
  getSimRunning,
  getSimSpeed,
  setSimClock,
  setSimRunning,
} from "@/lib/mesStore";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    clock:   (await getSimClock())?.toISOString() ?? null,
    running: await getSimRunning(),
    speed:   await getSimSpeed(),
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
      await setSimClock(null);
    } else {
      const d = new Date(body.clock as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid clock date" }, { status: 400 });
      }
      await setSimClock(d);
    }
  }

  if (body.running !== undefined) {
    await setSimRunning(Boolean(body.running), body.speed as number | undefined);
  } else if (body.speed !== undefined) {
    await setSimRunning(await getSimRunning(), body.speed as number);
  }

  return NextResponse.json({ ok: true });
}

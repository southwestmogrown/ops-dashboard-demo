import { NextRequest, NextResponse } from "next/server";
import {
  getSimRunning,
  getSimState,
  refreshCacheFromDb,
  setSimClock,
  setSimRunning,
  startSimSession,
} from "@/lib/mesStore";
import type { ShiftName } from "@/lib/types/core";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  await refreshCacheFromDb();
  return NextResponse.json(await getSimState());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.initializeSession === true) {
    const startShift = body.startShift as ShiftName | undefined;
    const speed = typeof body.speed === "number" ? body.speed : 60;
    if (startShift !== "day" && startShift !== "night") {
      return NextResponse.json(
        { error: "startShift must be 'day' or 'night'" },
        { status: 400 },
      );
    }
    await startSimSession(startShift, speed);
    return NextResponse.json({ ok: true });
  }

  if (body.clock !== undefined) {
    if (body.clock === null) {
      await setSimClock(null);
    } else {
      const date = new Date(body.clock as string);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Invalid clock date" }, { status: 400 });
      }
      await setSimClock(date);
    }
  }

  if (body.running !== undefined) {
    await setSimRunning(Boolean(body.running), body.speed as number | undefined);
  } else if (body.speed !== undefined) {
    await setSimRunning(await getSimRunning(), body.speed as number);
  }

  return NextResponse.json({ ok: true });
}

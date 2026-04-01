import { NextRequest, NextResponse } from "next/server";
import { setSchedule, enqueueSchedule, clearLine, skipOrder, unskipOrder } from "@/lib/mesStore";
import type { LineSchedule } from "@/lib/types/mes";
import { requireRole } from "@/lib/apiAuth";

interface ScheduleBody {
  lineId: string;
  schedule: LineSchedule;
  mode?: "replace" | "queue";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  const body = await request.json() as ScheduleBody;

  if (!body.lineId || !body.schedule) {
    return NextResponse.json({ error: "lineId and schedule are required" }, { status: 400 });
  }

  if (body.mode === "queue") {
    await enqueueSchedule(body.lineId, body.schedule);
  } else {
    await setSchedule(body.lineId, body.schedule);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body?.lineId) {
    return NextResponse.json({ error: "lineId required" }, { status: 400 });
  }
  await clearLine(body.lineId);
  return NextResponse.json({ ok: true });
}

interface SkipBody {
  lineId: string;
  model: string;
  action: "skip" | "unskip";
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  const body = await request.json().catch(() => null) as SkipBody | null;
  if (!body?.lineId || !body?.model || !body?.action) {
    return NextResponse.json({ error: "lineId, model, and action (skip|unskip) are required" }, { status: 400 });
  }
  const ok = body.action === "skip"
    ? await skipOrder(body.lineId, body.model)
    : await unskipOrder(body.lineId, body.model);
  return NextResponse.json({ ok });
}

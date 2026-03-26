import { NextRequest, NextResponse } from "next/server";
import { setSchedule, enqueueSchedule } from "@/lib/mesStore";
import type { LineSchedule } from "@/lib/mesTypes";

interface ScheduleBody {
  lineId: string;
  schedule: LineSchedule;
  /** "replace" clears the queue and sets a new active schedule (default).
   *  "queue" appends behind the current active schedule. */
  mode?: "replace" | "queue";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as ScheduleBody;

  if (!body.lineId || !body.schedule) {
    return NextResponse.json({ error: "lineId and schedule are required" }, { status: 400 });
  }

  if (body.mode === "queue") {
    enqueueSchedule(body.lineId, body.schedule);
  } else {
    setSchedule(body.lineId, body.schedule);
  }

  return NextResponse.json({ ok: true });
}

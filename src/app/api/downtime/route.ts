import { NextRequest, NextResponse } from "next/server";
import {
  addDowntimeEntry,
  getDowntimeEntries,
  closeDowntimeEntry,
  getAllDowntimeEntriesForShift,
} from "@/lib/mesStore";
import type { DowntimeReason, DowntimeEntry } from "@/lib/downtimeTypes";
import type { ShiftName } from "@/lib/types";

const VALID_REASONS: DowntimeReason[] = [
  "machine-failure",
  "material-shortage",
  "quality-hold",
  "planned-maintenance",
  "operator-break",
  "safety-stop",
  "changeover",
  "other",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId");
  const shift  = searchParams.get("shift") as ShiftName | null;

  if (!shift) {
    return NextResponse.json({ error: "shift query param is required" }, { status: 400 });
  }
  if (shift !== "day" && shift !== "night") {
    return NextResponse.json({ error: "shift must be 'day' or 'night'" }, { status: 400 });
  }

  if (lineId) {
    return NextResponse.json(await getDowntimeEntries(lineId, shift));
  }

  return NextResponse.json(await getAllDowntimeEntriesForShift(shift));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lineId, shift, reason, startTime, unitsLost, notes, createdBy } = body;

  if (!lineId || !shift || !reason || !startTime) {
    return NextResponse.json(
      { error: "lineId, shift, reason, and startTime are all required" },
      { status: 400 }
    );
  }
  if (shift !== "day" && shift !== "night") {
    return NextResponse.json({ error: "shift must be 'day' or 'night'" }, { status: 400 });
  }
  if (!VALID_REASONS.includes(reason as DowntimeReason)) {
    return NextResponse.json({ error: "invalid reason value" }, { status: 400 });
  }

  const entry: DowntimeEntry = {
    id: "",
    lineId:    lineId as string,
    shift:     shift as ShiftName,
    reason:    reason as DowntimeReason,
    startTime: startTime as string,
    endTime:   null,
    unitsLost: typeof unitsLost === "number" ? unitsLost : 0,
    notes:     typeof notes     === "string" ? notes     : "",
    createdBy: typeof createdBy === "string" ? createdBy : undefined,
  };

  const saved = await addDowntimeEntry(entry);
  return NextResponse.json(saved, { status: 201 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, endTime } = body;
  if (!id || !endTime) {
    return NextResponse.json({ error: "id and endTime are required" }, { status: 400 });
  }

  await closeDowntimeEntry(id as string, endTime as string);
  return NextResponse.json({ ok: true });
}

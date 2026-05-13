import { NextRequest, NextResponse } from "next/server";
import { getLineComments, getOperatingTime, setLineComment } from "@/lib/mesStore";
import type { ShiftName } from "@/lib/types/core";
import { requireRole } from "@/lib/apiAuth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, ["supervisor", "team-lead"]);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId");
  const shift = searchParams.get("shift") as ShiftName | null;
  const operatingTime = await getOperatingTime();

  if (!lineId) {
    return NextResponse.json({ error: "lineId is required" }, { status: 400 });
  }

  return NextResponse.json(
    await getLineComments(
      lineId,
      shift ?? operatingTime.currentShift ?? "day",
      operatingTime.productionDate,
    ),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, ["supervisor", "team-lead"]);
  if (authError) return authError;

  const body = await request.json() as {
    lineId: string;
    shift?: ShiftName;
    hour: string;
    comment: string;
  };
  const operatingTime = await getOperatingTime();

  if (!body.lineId || !body.hour) {
    return NextResponse.json({ error: "lineId and hour are required" }, { status: 400 });
  }

  await setLineComment(
    body.lineId,
    body.shift ?? operatingTime.currentShift ?? "day",
    operatingTime.productionDate,
    body.hour,
    body.comment ?? "",
  );
  return NextResponse.json({ ok: true });
}

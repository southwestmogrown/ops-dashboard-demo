import { NextRequest, NextResponse } from "next/server";
import { generateMetrics, getDefaultHeadcount, getDefaultTarget } from "@/lib/generateMetrics";
import { ShiftName } from "@/lib/types";
import { getOutputForLine, getAdminConfig, getKickedLidsForLineShift } from "@/lib/mesStore";
import { getShiftProgress } from "@/lib/shiftTime";

// The valid shift values the client can request
const VALID_SHIFTS: ShiftName[] = ["day", "night"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const shiftParam = searchParams.get("shift");

  if (!shiftParam || !VALID_SHIFTS.includes(shiftParam as ShiftName)) {
    return NextResponse.json(
      { error: "Invalid or missing shift parameter. Use: day, night" },
      { status: 400 }
    );
  }

  const envSeed = process.env.DEMO_SEED;
  const overrideSeed = envSeed ? parseInt(envSeed, 10) : undefined;

  const metrics = generateMetrics(shiftParam as ShiftName, overrideSeed);

  for (const line of metrics.lines) {
    const admin = getAdminConfig(line.id);
    line.target = admin.target ?? getDefaultTarget(line.id);
    line.headcount = admin.headcount ?? getDefaultHeadcount(line.id);
    line.output = getOutputForLine(line.id);

    const totalOutput = line.output;
    const kickedLids = getKickedLidsForLineShift(line.id, shiftParam as ShiftName);
    line.fpy =
      totalOutput > 0
        ? Math.min(100, Math.round(((totalOutput - kickedLids) / totalOutput) * 1000) / 10)
        : 100;

    const { elapsedHours } = getShiftProgress(shiftParam as ShiftName, new Date());
    line.hpu =
      totalOutput > 0
        ? Math.round((line.headcount * elapsedHours) / totalOutput * 100) / 100
        : 0;
  }

  return NextResponse.json(metrics);
}
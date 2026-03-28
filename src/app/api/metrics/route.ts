import { NextRequest, NextResponse } from "next/server";
import { generateMetrics, getDefaultHeadcount, getDefaultTarget } from "@/lib/generateMetrics";
import { ShiftName } from "@/lib/types";
import { getOutputForLine, getAdminConfig, getKickedLidsForLineShift } from "@/lib/mesStore";
import { getShiftProgress } from "@/lib/shiftTime";

// The valid shift values the client can request
const VALID_SHIFTS: ShiftName[] = ["day", "night"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Read the ?shift= query parameter from the URL
  const { searchParams } = new URL(request.url);
  const shiftParam = searchParams.get("shift");

  // Validate the shift param — return 400 if it's missing or invalid
  if (!shiftParam || !VALID_SHIFTS.includes(shiftParam as ShiftName)) {
    return NextResponse.json(
      { error: "Invalid or missing shift parameter. Use: day, night" },
      { status: 400 }
    );
  }

  // Read the optional seed from environment variables
  // process.env always returns string | undefined, so we parse it to a number
  const envSeed = process.env.DEMO_SEED;
  const overrideSeed = envSeed ? parseInt(envSeed, 10) : undefined;

  // Generate base metrics from seeded mock data
  const metrics = generateMetrics(shiftParam as ShiftName, overrideSeed);

  // Overlay admin-configured target and headcount, then MES output
  for (const line of metrics.lines) {
    const admin = getAdminConfig(line.id);
    line.target = admin.target ?? getDefaultTarget(line.id);

    // Headcount: admin override > line-type default (VS1=45, VS2=40)
    line.headcount = admin.headcount ?? getDefaultHeadcount(line.id);

    // Always use MES scan count — 0 when no scans yet, grows as sim runs
    line.output = getOutputForLine(line.id);

    // FPY: derive from scrap log; scrap log is the sole FPY driver
    const totalOutput = line.output;
    const kickedLids = getKickedLidsForLineShift(line.id, shiftParam as ShiftName);
    line.fpy =
      totalOutput > 0
        ? Math.min(100, Math.round(((totalOutput - kickedLids) / totalOutput) * 1000) / 10)
        : 100;

    // HPU: hours per unit = (headcount × elapsedHours) / output
    const { elapsedHours } = getShiftProgress(shiftParam as ShiftName, new Date());
    line.hpu =
      totalOutput > 0
        ? Math.round((line.headcount * elapsedHours) / totalOutput * 100) / 100
        : 0;
  }

  return NextResponse.json(metrics);
}
import { NextRequest, NextResponse } from "next/server";
import { generateMetrics } from "@/lib/generateMetrics";
import { ShiftName } from "@/lib/types";

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

  // Generate and return the metrics
  const metrics = generateMetrics(shiftParam as ShiftName, overrideSeed);

  return NextResponse.json(metrics);
}
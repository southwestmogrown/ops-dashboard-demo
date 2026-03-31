import { NextRequest, NextResponse } from "next/server";
import { resetSimulation } from "@/lib/mesStore";
import { requireRole } from "@/lib/apiAuth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  await resetSimulation();
  return NextResponse.json({ ok: true });
}
